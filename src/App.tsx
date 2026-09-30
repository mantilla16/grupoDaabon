import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  MiniMap,
  useReactFlow,
  useOnViewportChange,
  ViewportPortal,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'
import { AnimatePresence, motion } from 'motion/react'

import { type EntityType, type GraphData, type Ownership } from './data/graph'
import { TYPE_COLOR, TIER_STYLE, tierFor, EASE_OUT, SPRING, type Tier } from './lib/theme'
import { OwnershipEdge } from './components/OwnershipEdge'
import * as api from './lib/api'
import { computeGraphLayout, NODE_WIDTH, NODE_HEIGHT } from './lib/layout'
import { CompanyNode } from './components/CompanyNode'
import { DetailPanel } from './components/DetailPanel'
import { LeftPanel } from './components/LeftPanel'
import { CompanyModal } from './components/CompanyModal'
import { EdgeModal } from './components/EdgeModal'
import { Header } from './components/Header'
import { DataDrawer } from './components/DataDrawer'
import { TreeView } from './components/TreeView'

const nodeTypes = { company: CompanyNode }
const edgeTypes = { ownership: OwnershipEdge }

/**
 * §4 — Zoom semántico (Level Of Detail).
 * En cada cambio de viewport actualizamos variables CSS sobre
 * `.react-flow__viewport`. El CSS del nodo interpola tamaños desde estas vars
 * → al alejar la cámara los detalles se compactan y el nombre queda visible;
 * al acercar aparecen chip de tipo, grados y NIT.
 */
function LodSetter() {
  const rafRef = useRef(0)
  const apply = useCallback((zoom: number) => {
    const el = document.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) return
    const lod = Math.max(1, Math.min(1.9, 0.8 / zoom))
    el.style.setProperty('--lod', lod.toFixed(3))
    el.style.setProperty('--plod', Math.min(lod, 1.5).toFixed(3))
    el.style.setProperty('--detail', lod > 1.06 ? '0' : '1')
    el.style.setProperty('--minor', zoom < 0.42 ? '0' : '1')
    el.style.setProperty('--nameMargin', lod > 1.06 ? 'auto 0' : '0')
  }, [])
  useOnViewportChange({
    onChange: (v) => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => apply(v.zoom))
    },
  })
  // Aplicar valores iniciales en cuanto el componente se monta
  useEffect(() => {
    apply(0.82)
  }, [apply])
  return null
}

/** Smoothly interpolates node positions whenever the layout moves them (e.g. TB ⇄ LR). */
function useTweenedNodes(target: Node[], duration = 750): Node[] {
  const [display, setDisplay] = useState<Node[]>(target)
  const current = useRef<Map<string, { x: number; y: number }>>(new Map())

  useEffect(() => {
    const from = new Map(current.current)
    const moved = target.some((n) => {
      const p = from.get(n.id)
      return p && (Math.abs(p.x - n.position.x) > 0.5 || Math.abs(p.y - n.position.y) > 0.5)
    })
    const snapshot = () => {
      const m = new Map<string, { x: number; y: number }>()
      target.forEach((n) => m.set(n.id, { ...n.position }))
      current.current = m
    }
    if (!moved || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(target)
      snapshot()
      return
    }
    const start = performance.now()
    let raf = 0
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration)
      const e = ease(k)
      const m = new Map<string, { x: number; y: number }>()
      const next = target.map((n) => {
        const f = from.get(n.id)
        if (!f) { m.set(n.id, n.position); return n }
        const pos = { x: f.x + (n.position.x - f.x) * e, y: f.y + (n.position.y - f.y) * e }
        m.set(n.id, pos)
        return { ...n, position: pos }
      })
      current.current = m
      setDisplay(next)
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return display
}

function PanelRail({ side, collapsed, onExpand, label }: { side: 'left' | 'right'; collapsed: boolean; onExpand: () => void; label: string }) {
  return (
    <button
      className={`panel-rail panel-rail--${side}` + (collapsed ? '' : ' is-hidden')}
      onClick={onExpand}
      title={`Mostrar ${label.toLowerCase()}`}
      tabIndex={collapsed ? 0 : -1}
      aria-hidden={!collapsed}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75">
        {side === 'left' ? <path d="M8 4l6 6-6 6" /> : <path d="M12 4l-6 6 6 6" />}
      </svg>
      <span className="panel-rail-label">{label}</span>
    </button>
  )
}

function Inner() {
  // Data lives in a SQLite file on disk (server/). We hydrate on mount and
  // reload after every mutation. No localStorage — a code refactor or another
  // browser tab cannot wipe the truth.
  const [data, setData] = useState<GraphData>({ nodes: [], edges: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [layout, setLayout] = useState<'TB' | 'LR'>('TB')
  const [view, setView] = useState<'graph' | 'tree'>(() => {
    try { return (localStorage.getItem('daabon-view') as 'graph' | 'tree') || 'graph' } catch { return 'graph' }
  })
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('daabon-left-collapsed') === '1' } catch { return false }
  })
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('daabon-right-collapsed') === '1' } catch { return false }
  })

  useEffect(() => { try { localStorage.setItem('daabon-view', view) } catch {} }, [view])
  useEffect(() => { try { localStorage.setItem('daabon-left-collapsed', leftCollapsed ? '1' : '0') } catch {} }, [leftCollapsed])
  useEffect(() => { try { localStorage.setItem('daabon-right-collapsed', rightCollapsed ? '1' : '0') } catch {} }, [rightCollapsed])

  // Modals
  const [editingCompany, setEditingCompany] = useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [editingEdge, setEditingEdge] = useState<{ open: boolean; index: number | null; defaultFrom?: number; defaultTo?: number }>({ open: false, index: null })
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const rf = useReactFlow()

  // Entrance choreography runs once; afterwards every change animates without delays.
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setIntro(false), 3200)
    return () => window.clearTimeout(t)
  }, [])

  // Cursor spotlight on the canvas (CSS vars, no re-render)
  const canvasRef = useRef<HTMLDivElement>(null)
  const onCanvasMove = useCallback((e: React.MouseEvent) => {
    const el = canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  // Load from SQLite on mount + expose a reload helper for post-mutation refresh.
  const reload = useCallback(async () => {
    try {
      const g = await api.fetchGraph()
      setData(g)
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [])
  useEffect(() => { reload() }, [reload])

  // Build focus sets
  const focusSets = useMemo(() => {
    if (focusedId == null) return null
    const up = new Set<number>()
    const down = new Set<number>()
    const stackUp = [focusedId]
    while (stackUp.length) {
      const cur = stackUp.pop()!
      for (const e of data.edges) {
        if (e.to === cur && !up.has(e.from)) {
          up.add(e.from)
          stackUp.push(e.from)
        }
      }
    }
    const stackDown = [focusedId]
    while (stackDown.length) {
      const cur = stackDown.pop()!
      for (const e of data.edges) {
        if (e.from === cur && !down.has(e.to)) {
          down.add(e.to)
          stackDown.push(e.to)
        }
      }
    }
    const active = new Set<number>([focusedId, ...up, ...down])
    return { up, down, active }
  }, [focusedId, data.edges])

  // Node/edge counts per node
  const degrees = useMemo(() => {
    const m = new Map<number, { inn: number; out: number }>()
    data.nodes.forEach((n) => m.set(n.id, { inn: 0, out: 0 }))
    data.edges.forEach((e) => {
      const t = m.get(e.to); if (t) t.inn++
      const f = m.get(e.from); if (f) f.out++
    })
    return m
  }, [data])

  // Ancho/alto del canvas para el cálculo del aspecto (agrupar §1).
  // Usamos `canvasRef` que ya declaramos arriba (para el spotlight);
  // no lo redeclaramos.
  const [canvasSize, setCanvasSize] = useState({ w: 1280, h: 720 })
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setCanvasSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // §1 — Ejecutamos computeGraphLayout una sola vez por cambio real (dir + foco
  // + datos). Devuelve posiciones, geometría de cada arista (points + labelXY)
  // y el frame del bloque "Estructuras independientes".
  const layoutRes = useMemo(() => {
    // En modo foco solo se pasan los nodos/edges de la cadena. Sin foco, todos.
    const activeIds = focusSets
      ? data.nodes.filter((n) => focusSets.active.has(n.id)).map((n) => n.id)
      : data.nodes.map((n) => n.id)
    const idSet = new Set(activeIds)
    const activeEdges = data.edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => idSet.has(e.from) && idSet.has(e.to))
    return computeGraphLayout({
      nodeIds: activeIds,
      edges: activeEdges.map(({ e, i }) => ({
        index: i,
        from: e.from,
        to: e.to,
        label: e.weight ? `${e.weight}%` : 'sin %',
      })),
      direction: layout,
      // Solo agrupamos "independientes" cuando NO hay foco (§1.7).
      group: focusSets == null,
      canvasWidth: canvasSize.w,
      canvasHeight: canvasSize.h,
    })
  }, [data.nodes, data.edges, layout, focusSets, canvasSize.w, canvasSize.h])

  // Interacciones: hover en nodo / arista / tier de la leyenda (§6).
  // TODO(§6): conectar `query` y `filterType` desde LeftPanel para atenuar
  // en el grafo los nodos que no coinciden con búsqueda o filtro de tipo.
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [hoverEdge, setHoverEdge] = useState<number | null>(null)
  const [hoverTier, setHoverTier] = useState<Tier | null>(null)

  // Set de "vecinos activos" según hover / selección
  const activeSet = useMemo(() => {
    const act = hoverId != null ? hoverId : (hoverEdge == null && !hoverTier ? selectedId : null)
    const nb = new Set<number>()
    if (act != null) {
      nb.add(act)
      data.edges.forEach((e) => {
        if (e.from === act) nb.add(e.to)
        if (e.to === act) nb.add(e.from)
      })
    }
    if (hoverEdge != null) {
      const e = data.edges[hoverEdge]
      if (e) { nb.add(e.from); nb.add(e.to) }
    }
    if (hoverTier) {
      data.edges.forEach((e) => {
        if (tierFor(e.weight) === hoverTier) { nb.add(e.from); nb.add(e.to) }
      })
    }
    return { act, nb, hoverMode: hoverId != null || hoverEdge != null || !!hoverTier }
  }, [hoverId, hoverEdge, hoverTier, selectedId, data.edges])

  // Build React Flow nodes usando el layout portado
  const rfNodes: Node[] = useMemo(() => {
    const anyEmph = hoverEdge != null || !!hoverTier || activeSet.act != null

    return data.nodes.map((n) => {
      const pos = layoutRes.positions.get(String(n.id))
      const hidden = !pos // fuera de la cadena en foco
      let opacity = 1
      if (!hidden) {
        if (anyEmph && !activeSet.nb.has(n.id)) opacity = activeSet.hoverMode ? 0.3 : 0.5
      }

      return {
        id: String(n.id),
        type: 'company',
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        measured: { width: NODE_WIDTH, height: NODE_HEIGHT },
        position: pos ?? { x: 0, y: 0 },
        data: {
          label: n.name,
          nit: n.nit,
          type: n.type,
          ownersCount: degrees.get(n.id)?.inn ?? 0,
          ownedCount: degrees.get(n.id)?.out ?? 0,
          dimmed: opacity < 1,
          focused: focusedId === n.id,
          inPath: focusSets ? focusSets.active.has(n.id) && focusedId !== n.id : false,
          direction: layout,
          rank: layoutRes.ranks.get(String(n.id)) ?? 0,
          enterDelay: intro
            ? 0.22 + (layoutRes.ranks.get(String(n.id)) ?? 0) * 0.115
            : 0,
        },
        selected: selectedId === n.id,
        hidden,
        style: { opacity },
      }
    })
  }, [
    data.nodes, layoutRes, degrees, layout,
    focusSets, focusedId, selectedId, intro,
    activeSet, hoverEdge, hoverTier,
  ])

  const displayNodes = useTweenedNodes(rfNodes)

  const openEdge = useCallback((index: number) => setEditingEdge({ open: true, index }), [])

  // Aristas — inyectamos la geometría (points + labelXY) computada por dagre
  // en `data`. El custom edge las convierte en path ortogonal con esquinas r=8.
  const rfEdges: Edge[] = useMemo(() => {
    const anyEmph = hoverEdge != null || !!hoverTier || activeSet.act != null
    return data.edges.map((e, i) => {
      const geo = layoutRes.edges.get(i)
      const sourcePos = layoutRes.positions.get(String(e.from))
      const targetPos = layoutRes.positions.get(String(e.to))
      const tier: Tier = tierFor(e.weight)
      // Énfasis: hover directo, hover de tier, o vecinos del nodo activo
      let emph = false
      if (hoverEdge != null) emph = i === hoverEdge
      else if (hoverTier) emph = tier === hoverTier
      else if (activeSet.act != null) emph = e.from === activeSet.act || e.to === activeSet.act
      const dim = anyEmph && !emph
      return {
        id: `e-${i}`,
        source: String(e.from),
        target: String(e.to),
        type: 'ownership',
        zIndex: emph ? 5 : 0,
        // NO usar el prop `hidden` de React Flow acá — cuando lo activábamos
        // en un momento donde algún nodo aún no tenía posición (measured aún
        // no aplicaba), la pipeline interna descartaba TODA la lista de edges
        // y no volvía. Preferimos ocultar visualmente devolviendo null desde
        // el componente cuando falta la geometría.
        data: {
          tier,
          weight: e.weight,
          dim,
          focused: focusedId != null,
          emphasized: emph,
          intro,
          delay: intro ? 0.52 + (layoutRes.ranks.get(String(e.from)) ?? 0) * 0.115 : 0,
          index: i,
          direction: layout,
          geometry: geo,
          sourcePos,
          targetPos,
          onOpen: openEdge,
        },
      }
    })
  }, [data.edges, layoutRes, focusedId, intro, layout, openEdge, activeSet, hoverEdge, hoverTier])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedId(Number(node.id))
  }, [])
  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    const idx = Number(edge.id.replace('e-', ''))
    setEditingEdge({ open: true, index: idx })
  }, [])
  const onPaneClick = useCallback(() => {
    setSelectedId(null)
  }, [])
  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    setFocusedId(Number(node.id))
  }, [])

  // §5 — fitBounds: encuadre común usando el bounding box calculado por
  // computeGraphLayout (incluye el frame de "Estructuras independientes").
  // Padding 64 lados + 30 abajo (leyenda). Zoom máximo 1.1.
  const fitBounds = useCallback((
    b: { x: number; y: number; w: number; h: number },
    duration: number,
    mul = 1,
  ) => {
    const W = canvasSize.w
    const H = canvasSize.h
    const pad = 64
    const kFit = Math.min((W - pad * 2) / b.w, (H - pad * 2 - 30) / b.h)
    const k = Math.max(0.2, Math.min(kFit, 1.1)) * mul
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    rf.setViewport(
      { x: W / 2 - cx * k, y: (H - 30) / 2 - cy * k, zoom: k },
      { duration },
    )
  }, [canvasSize.w, canvasSize.h, rf])

  // Re-frame after the TB ⇄ LR morph finishes (fit al bounds nuevo)
  const firstLayout = useRef(true)
  const fitBoundsRef = useRef<null | (() => void)>(null)
  useEffect(() => {
    fitBoundsRef.current = () => fitBounds(layoutRes.bounds, 950)
  }, [fitBounds, layoutRes])
  useEffect(() => {
    if (firstLayout.current) { firstLayout.current = false; return }
    const t = window.setTimeout(() => fitBoundsRef.current?.(), 560)
    return () => window.clearTimeout(t)
  }, [layout])

  // §5 — Fit inicial animado: arranca a 82 % del zoom fit y se acerca al 100 %
  // en 1500ms (easeOutQuart implícito en setViewport de xyflow).
  const initialCenterDone = useRef(false)
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (initialCenterDone.current) return
    if (rfNodes.length === 0) return
    if (canvasSize.w <= 1) return
    initialCenterDone.current = true
    // Fit al bounding box completo (grafo + frame de independientes).
    // Primero al 82 % del zoom (posición "vista amplia") y en el segundo frame
    // animamos al 100 % en 1500ms → efecto de acercamiento sutil.
    const raf1 = requestAnimationFrame(() => {
      fitBounds(layoutRes.bounds, 0, 0.82)
      const raf2 = requestAnimationFrame(() => {
        fitBounds(layoutRes.bounds, 1500)
      })
      cleanupRef.current = () => cancelAnimationFrame(raf2)
    })
    return () => {
      cancelAnimationFrame(raf1)
      cleanupRef.current?.()
    }
  }, [rfNodes, canvasSize.w, layoutRes, fitBounds])

  // Zoom-in al entrar en foco, restauración de la vista PREVIA al salir.
  //
  // Estrategia: al entrar en foco guardamos el viewport actual (x, y, zoom).
  // Al salir, restauramos exactamente ese viewport → el usuario vuelve al
  // punto y zoom que tenía antes de enfocar, sin cálculos de centroide que
  // caigan en lugares raros cuando el layout es asimétrico.
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const firstFocusRun = useRef(true)
  useEffect(() => {
    if (firstFocusRun.current) { firstFocusRun.current = false; return }
    // Al entrar en foco guardamos la vista actual, al salir la restauramos.
    // Cuando hay foco activo, `layoutRes.bounds` ya está limitado al subgrafo
    // (computeGraphLayout se llama con solo esos IDs), así que fit al bounds
    // encuadra directamente la cadena.
    const t = window.setTimeout(() => {
      if (focusSets) {
        savedViewportRef.current = rf.getViewport()
        fitBounds(layoutRes.bounds, 950)
      } else {
        const prev = savedViewportRef.current
        if (prev) rf.setViewport(prev, { duration: 950 })
        else fitBounds(layoutRes.bounds, 950)
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [focusSets, rf, layoutRes, fitBounds])

  // Handlers
  const handleFocus = (id: number) => {
    setFocusedId(id)
    setSelectedId(id)
  }
  const handleClearFocus = () => setFocusedId(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editingCompany.open || editingEdge.open || drawerOpen) return
      setFocusedId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingCompany.open, editingEdge.open, drawerOpen])

  // §5 — Botón "Ajustar": fit al bounding box en 700 ms.
  const handleFit = () => fitBounds(layoutRes.bounds, 700)

  const handleAddCompany = () => setEditingCompany({ open: true, id: null })
  const handleEditCompany = (id: number) => setEditingCompany({ open: true, id })

  const handleSaveCompany = async ({ name, nit, type }: { name: string; nit: string; type: EntityType }) => {
    try {
      if (editingCompany.id != null) {
        await api.updateCompany(editingCompany.id, { name, nit, type })
      } else {
        await api.createCompany({ name, nit, type })
      }
      await reload()
      setEditingCompany({ open: false, id: null })
      showToast(editingCompany.id != null ? 'Compañía actualizada' : 'Compañía agregada')
    } catch (e) {
      showToast('Error: ' + (e as Error).message)
    }
  }
  const handleDeleteCompany = async (id: number) => {
    const c = data.nodes.find((n) => n.id === id)
    if (!c) return
    if (!window.confirm(`¿Eliminar "${c.name}" y todas sus relaciones?`)) return
    try {
      await api.deleteCompany(id)
      await reload()
      if (selectedId === id) setSelectedId(null)
      if (focusedId === id) setFocusedId(null)
      setEditingCompany({ open: false, id: null })
      showToast('Compañía eliminada')
    } catch (e) {
      showToast('Error: ' + (e as Error).message)
    }
  }

  const handleNewEdge = (fromId?: number, toId?: number) => {
    setEditingEdge({ open: true, index: null, defaultFrom: fromId, defaultTo: toId })
  }
  const handleEditEdge = (index: number) => setEditingEdge({ open: true, index })

  const handleSaveEdge = async (edge: Ownership) => {
    try {
      if (editingEdge.index != null) {
        const existing = data.edges[editingEdge.index] as Ownership & { id?: number }
        if (existing?.id != null) {
          await api.updateOwnership(existing.id, { from: edge.from, to: edge.to, weight: edge.weight })
        } else {
          // Legacy edge with no db id — recreate
          await api.createOwnership(edge)
        }
      } else {
        await api.createOwnership(edge)
      }
      await reload()
      setEditingEdge({ open: false, index: null })
      showToast('Participación guardada')
    } catch (e) {
      showToast('Error: ' + (e as Error).message)
    }
  }
  const handleDeleteEdge = async () => {
    if (editingEdge.index == null) return
    if (!window.confirm('¿Eliminar esta participación?')) return
    try {
      const existing = data.edges[editingEdge.index] as Ownership & { id?: number }
      if (existing?.id != null) await api.deleteOwnership(existing.id)
      await reload()
      setEditingEdge({ open: false, index: null })
      showToast('Participación eliminada')
    } catch (e) {
      showToast('Error: ' + (e as Error).message)
    }
  }

  const handleImport = async (imported: GraphData) => {
    try {
      await api.replaceGraph(imported)
      await reload()
      setSelectedId(null)
      setFocusedId(null)
    } catch (e) {
      showToast('Error importando: ' + (e as Error).message)
    }
  }
  const handleReset = async () => {
    try {
      await api.restoreOriginal()
      await reload()
      setSelectedId(null)
      setFocusedId(null)
    } catch (e) {
      showToast('Error restaurando: ' + (e as Error).message)
    }
  }

  const companyBeingEdited = editingCompany.id != null ? data.nodes.find((n) => n.id === editingCompany.id) ?? null : null
  const edgeBeingEdited = editingEdge.index != null ? data.edges[editingEdge.index] ?? null : null

  return (
    <div className="app">
      {loadError && (
        <div className="server-banner" role="alert">
          <strong>Sin conexión con el servidor SQLite</strong>
          <span>{loadError}</span>
          <span className="server-banner-hint">Arrancalo con <code>npm run server</code> (o <code>npm run dev</code> para servidor + cliente juntos).</span>
          <button onClick={reload}>Reintentar</button>
        </div>
      )}
      {isLoading && !loadError && (
        <div className="server-banner is-loading">Cargando estructura desde SQLite…</div>
      )}
      <Header
        onNewCompany={handleAddCompany}
        onNewEdge={() => handleNewEdge()}
        onFit={handleFit}
        onDataMenu={() => setDrawerOpen(true)}
        layout={layout}
        onToggleLayout={() => setLayout((l) => (l === 'TB' ? 'LR' : 'TB'))}
        view={view}
        onSetView={setView}
        companies={data.nodes.length}
        relations={data.edges.length}
        missing={data.edges.filter((e) => !e.weight).length}
      />

      <main
        className={
          'app-main' +
          (leftCollapsed ? ' left-collapsed' : '') +
          (rightCollapsed ? ' right-collapsed' : '')
        }
      >
        <PanelRail
          side="left"
          collapsed={leftCollapsed}
          onExpand={() => setLeftCollapsed(false)}
          label="Compañías"
        />
        <motion.div
          className={'left-panel-wrap' + (leftCollapsed ? ' is-collapsed' : '')}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: EASE_OUT }}
        >
          <button
            className="panel-collapse-btn"
            onClick={() => setLeftCollapsed(true)}
            title="Recoger panel"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 4l-6 6 6 6" /></svg>
          </button>
          <LeftPanel
            data={data}
            selectedId={selectedId}
            onSelect={(id) => {
              // Click en la lista = solo seleccionar (para ver el detalle en el
              // panel derecho). Si el usuario quiere zoom sobre la cadena,
              // usa el botón "Enfocar" (o doble-click en el grafo).
              setSelectedId(id)
            }}
            onAddCompany={handleAddCompany}
            onFocus={handleFocus}
            focusedId={focusedId}
            onClearFocus={handleClearFocus}
          />
        </motion.div>

        <motion.div
          className="canvas-wrap"
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE_OUT }}
        >
        <AnimatePresence mode="wait">
        {view === 'tree' ? (
          <motion.div
            key="tree"
            className="view-pane"
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
          <TreeView
            data={data}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onFocus={(id) => {
              handleFocus(id)
              setView('graph')
            }}
          />
          </motion.div>
        ) : (
        <motion.div
          key="graph"
          className="graph-canvas view-pane"
          ref={canvasRef}
          onMouseMove={onCanvasMove}
          initial={{ opacity: 0, filter: 'blur(6px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(6px)' }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          <ReactFlow
            key={`rf-${data.nodes.length > 0 ? 'ready' : 'empty'}-${layout}`}
            nodes={displayNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeMouseEnter={(_, node) => setHoverId(Number(node.id))}
            onNodeMouseLeave={() => setHoverId(null)}
            onEdgeMouseEnter={(_, edge) => setHoverEdge(Number(edge.id.replace('e-', '')))}
            onEdgeMouseLeave={() => setHoverEdge(null)}
            defaultViewport={{ x: 0, y: 0, zoom: 0.82 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2.5}
          >
            {/* §4 — Zoom semántico: al cambiar el viewport, actualizamos vars CSS */}
            <LodSetter />

            {/* §1 — Marco del bloque "Estructuras independientes" */}
            {layoutRes.frame && (
              <ViewportPortal>
                <div
                  className="independent-frame"
                  style={{
                    position: 'absolute',
                    left: layoutRes.frame.x,
                    top: layoutRes.frame.y,
                    width: layoutRes.frame.w,
                    height: layoutRes.frame.h,
                  }}
                >
                  <div className="independent-frame-head">
                    <span>Estructuras independientes</span>
                    <span className="independent-frame-count">{layoutRes.frame.count}</span>
                  </div>
                </div>
              </ViewportPortal>
            )}

            <MiniMap
              nodeColor={(n) => {
                const type = (n.data as { type?: EntityType })?.type ?? 'Otro'
                return TYPE_COLOR[type]
              }}
              nodeStrokeWidth={0}
              nodeBorderRadius={3}
              maskColor="rgba(18, 18, 20, 0.06)"
              maskStrokeColor="#7A1F32"
              maskStrokeWidth={1.5}
              pannable
              zoomable
            />
            <Controls position="bottom-right" showInteractive={false} />
          </ReactFlow>

          <AnimatePresence>
          {focusedId != null && (
            <motion.div
              className="focus-banner"
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={SPRING}
            >
              <span className="live-dot" />
              <span>
                Enfocado: <strong>{data.nodes.find((n) => n.id === focusedId)?.name}</strong>
                <span className="focus-banner-sub">
                  {' · '}
                  {focusSets?.up.size ?? 0} dueño(s), {focusSets?.down.size ?? 0} participada(s)
                </span>
              </span>
              <button className="focus-banner-clear" onClick={handleClearFocus}>
                Limpiar
                <kbd>Esc</kbd>
              </button>
            </motion.div>
          )}
          </AnimatePresence>

          <Legend onHoverTier={setHoverTier} />
        </motion.div>
        )}
        </AnimatePresence>
        </motion.div>

        <motion.div
          className={'right-panel-wrap' + (rightCollapsed ? ' is-collapsed' : '')}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: EASE_OUT }}
        >
          <button
            className="panel-collapse-btn panel-collapse-btn--right"
            onClick={() => setRightCollapsed(true)}
            title="Recoger panel"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M8 4l6 6-6 6" /></svg>
          </button>
          <aside className="right-panel">
            <DetailPanel
              data={data}
              selectedId={selectedId}
              onSelect={(id) => {
                // Click en un dueño/participada del detalle = solo seleccionar.
                // Sin zoom automático (evita saltos visuales inesperados).
                setSelectedId(id)
              }}
              onFocus={handleFocus}
              onEditCompany={handleEditCompany}
              onDeleteCompany={handleDeleteCompany}
              onEditEdge={handleEditEdge}
              onNewEdge={handleNewEdge}
            />
          </aside>
        </motion.div>
        <PanelRail
          side="right"
          collapsed={rightCollapsed}
          onExpand={() => setRightCollapsed(false)}
          label="Detalle"
        />
      </main>

      <CompanyModal
        open={editingCompany.open}
        company={companyBeingEdited}
        onClose={() => setEditingCompany({ open: false, id: null })}
        onSave={handleSaveCompany}
        onDelete={editingCompany.id != null ? () => handleDeleteCompany(editingCompany.id!) : undefined}
      />

      <EdgeModal
        open={editingEdge.open}
        edge={edgeBeingEdited}
        companies={data.nodes}
        defaultFrom={editingEdge.defaultFrom}
        defaultTo={editingEdge.defaultTo}
        onClose={() => setEditingEdge({ open: false, index: null })}
        onSave={handleSaveEdge}
        onDelete={editingEdge.index != null ? handleDeleteEdge : undefined}
      />

      <DataDrawer
        open={drawerOpen}
        data={data}
        onClose={() => setDrawerOpen(false)}
        onImport={handleImport}
        onReset={handleReset}
        onToast={showToast}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast}
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.18 } }}
            transition={SPRING}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="toast-icon">
              <motion.path d="M5 10.5l3.2 3.2L15 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.12, duration: 0.4, ease: EASE_OUT }} />
            </svg>
            <span>{toast}</span>
            <motion.span className="toast-timer" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: 2.6, ease: 'linear' }} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Legend({ onHoverTier }: { onHoverTier: (t: Tier | null) => void }) {
  const [open, setOpen] = useState(true)
  const types: { t: EntityType; title: string }[] = [
    { t: 'SAS', title: 'Sociedad por acciones simplificada' },
    { t: 'SCA', title: 'Sociedad en comandita por acciones' },
    { t: 'SA', title: 'Sociedad anónima' },
    { t: 'PN', title: 'Persona natural' },
    { t: 'Otro', title: 'Otra figura' },
  ]
  const tiers: Tier[] = ['ctrl', 'sig', 'minor', 'missing']
  return (
    <motion.div
      className={'legend' + (open ? ' is-open' : '')}
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 1.2, ease: EASE_OUT, layout: SPRING }}
    >
      <motion.button layout="position" className="legend-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Leyenda</span>
        <motion.svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" animate={{ rotate: open ? 180 : 0 }} transition={SPRING}>
          <path d="M3 7.5 6 4.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="legend-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            <div className="legend-block">
              <div className="legend-title">Tipo de entidad</div>
              <div className="legend-items">
                {types.map(({ t, title }) => (
                  <div key={t} className="legend-item" title={title}>
                    <span className="legend-swatch" style={{ background: TYPE_COLOR[t] }} />
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="legend-block">
              <div className="legend-title">Participación <span className="legend-subtitle">· pasa el cursor para resaltar</span></div>
              <div className="legend-edges">
                {tiers.map((tier) => (
                  <div
                    key={tier}
                    className="legend-edge"
                    onMouseEnter={() => onHoverTier(tier)}
                    onMouseLeave={() => onHoverTier(null)}
                  >
                    <svg viewBox="0 0 40 10" width="40" height="10">
                      <line x1="1" y1="5" x2="39" y2="5" stroke={TIER_STYLE[tier].stroke} strokeWidth={TIER_STYLE[tier].width}
                        strokeDasharray={tier === 'missing' ? '5 4' : undefined} strokeLinecap="round" />
                    </svg>
                    <span className={'edge-pill edge-pill-static tier-' + tier}>
                      {tier === 'missing' ? 'SIN %' : tier === 'ctrl' ? '100%' : tier === 'sig' ? '20%' : '0,5%'}
                    </span>
                    <span className="legend-edge-label">{TIER_STYLE[tier].label}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  )
}
