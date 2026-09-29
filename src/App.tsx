import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  BackgroundVariant,
  MarkerType,
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
import { layoutGraph } from './lib/layout'
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

  // Build React Flow nodes+edges (with layout)
  const rfNodes: Node[] = useMemo(() => {
    const raw: Node[] = data.nodes.map((n) => ({
      id: String(n.id),
      type: 'company',
      width: 220,
      height: 100,
      // In xyflow v12 the internal edge routing needs `measured` sizes upfront
      // (nodes normally auto-measure after DOM paint, but the initial edge
      // rendering pass runs before that). Providing them here means edges
      // appear on first render instead of after a re-layout tick.
      measured: { width: 220, height: 100 },
      position: { x: 0, y: 0 },
      data: {
        label: n.name,
        nit: n.nit,
        type: n.type,
        ownersCount: degrees.get(n.id)?.inn ?? 0,
        ownedCount: degrees.get(n.id)?.out ?? 0,
        dimmed: focusSets ? !focusSets.active.has(n.id) : false,
        focused: focusedId === n.id,
        inPath: focusSets ? focusSets.active.has(n.id) && focusedId !== n.id : false,
        direction: layout,
      },
      selected: selectedId === n.id,
      // Cuando hay foco, escondemos completamente los nodos fuera de la cadena.
      // El fitView de abajo hace zoom sobre el subgrafo activo.
      hidden: focusSets ? !focusSets.active.has(n.id) : false,
    }))
    const rfEdges: Edge[] = data.edges.map((e, i) => ({
      id: `e-${i}`,
      source: String(e.from),
      target: String(e.to),
    }))
    const laid = layoutGraph(raw, rfEdges, layout)
    // Stagger entrance by rank (top→bottom), with a slight sweep across each rank
    const axis = (p: { x: number; y: number }) => (layout === 'TB' ? p.y : p.x)
    const cross = (p: { x: number; y: number }) => (layout === 'TB' ? p.x : p.y)
    const ranks = Array.from(new Set(laid.map((n) => Math.round(axis(n.position))))).sort((a, b) => a - b)
    const minCross = Math.min(...laid.map((n) => cross(n.position)))
    return laid.map((n) => ({
      ...n,
      data: {
        ...n.data,
        enterDelay: intro ? 0.45 + ranks.indexOf(Math.round(axis(n.position))) * 0.16 + (cross(n.position) - minCross) / 9000 : 0,
      },
    }))
  }, [data.nodes, data.edges, layout, degrees, focusSets, focusedId, selectedId, intro])

  const displayNodes = useTweenedNodes(rfNodes)

  const openEdge = useCallback((index: number) => setEditingEdge({ open: true, index }), [])

  const rfEdges: Edge[] = useMemo(() => {
    const delayOf = new Map<string, number>()
    rfNodes.forEach((n) => delayOf.set(n.id, (n.data as { enterDelay?: number }).enterDelay ?? 0))

    // Lane assignment: give each edge a per-edge lane number so edges that share
    // the same source (fanning out) or target (fanning in) don't overlap through
    // the same corridor. The number is symmetric around 0 → the group centers on
    // its natural elbow, then spreads outward evenly.
    const fromCount = new Map<number, number>()
    const toCount = new Map<number, number>()
    const fromIndex = new Map<string, number>()
    const toIndex = new Map<string, number>()
    for (const e of data.edges) {
      const fi = fromCount.get(e.from) ?? 0
      fromIndex.set(`${e.from}>${e.to}`, fi)
      fromCount.set(e.from, fi + 1)
      const ti = toCount.get(e.to) ?? 0
      toIndex.set(`${e.from}>${e.to}`, ti)
      toCount.set(e.to, ti + 1)
    }

    return data.edges.map((e, i) => {
      const tier: Tier = tierFor(e.weight)
      const inFocus = !!focusSets && focusSets.active.has(e.from) && focusSets.active.has(e.to)
      const dim = !!focusSets && !inFocus
      const stroke = inFocus ? '#7A1F32' : dim ? '#DADAD5' : TIER_STYLE[tier].stroke

      // Compute lane offset: spread siblings around the center by 18px each.
      const key = `${e.from}>${e.to}`
      const outSize = fromCount.get(e.from) ?? 1
      const outIdx = fromIndex.get(key) ?? 0
      const outLane = outSize > 1 ? outIdx - (outSize - 1) / 2 : 0
      const inSize = toCount.get(e.to) ?? 1
      const inIdx = toIndex.get(key) ?? 0
      const inLane = inSize > 1 ? inIdx - (inSize - 1) / 2 : 0
      // The stronger of the two determines the lateral shift.
      const lane = Math.abs(outLane) >= Math.abs(inLane) ? outLane : inLane
      const laneOffset = lane * 20

      return {
        id: `e-${i}`,
        source: String(e.from),
        target: String(e.to),
        type: 'ownership',
        zIndex: inFocus ? 5 : 0,
        // Igual que los nodos: en modo foco las flechas fuera de la cadena
        // desaparecen — dejamos solo el flujo que se está inspeccionando.
        hidden: dim,
        data: {
          tier,
          weight: e.weight,
          dim,
          focused: inFocus,
          intro,
          delay: (delayOf.get(String(e.from)) ?? 0) + 0.2,
          index: i,
          laneOffset,
          onOpen: openEdge,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
      }
    })
  }, [data.edges, focusSets, intro, rfNodes, openEdge])

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

  // Re-frame after the TB ⇄ LR morph finishes
  const firstLayout = useRef(true)
  useEffect(() => {
    if (firstLayout.current) { firstLayout.current = false; return }
    const t = window.setTimeout(() => rf.fitView({ padding: 0.2, duration: 700 }), 780)
    return () => window.clearTimeout(t)
  }, [layout, rf])

  // Centro inicial cómodo: la primera vez que hay nodos en pantalla, movemos la
  // vista al centroide del grafo con zoom 0.9. Así arrancamos con nodos legibles
  // (a tamaño casi natural) y el usuario panea para explorar — como Figma.
  //
  // IMPORTANTE: marcamos `done = true` SÍNCRONO al detectar nodos. Si en su
  // lugar dejáramos el flag para dentro del setTimeout, cada re-render (ej.
  // click en un nodo → cambia selectedId → cambia rfNodes) cancelaría el timer
  // viejo y arrancaría uno nuevo, disparando setCenter DESPUÉS del click y
  // sintiéndose como "zoom al centro al clickear cualquier casilla".
  const initialCenterDone = useRef(false)
  useEffect(() => {
    if (initialCenterDone.current) return
    if (rfNodes.length === 0) return
    initialCenterDone.current = true
    // Bounding box del grafo entero
    const positions = rfNodes.map((n) => n.position)
    const xs = positions.map((p) => p.x)
    const ys = positions.map((p) => p.y)
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 110
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 50
    // rAF asegura que React Flow terminó de montar antes de mover la vista
    const raf = requestAnimationFrame(() => {
      rf.setCenter(cx, cy, { zoom: 0.9, duration: 400 })
    })
    return () => cancelAnimationFrame(raf)
  }, [rfNodes, rf])

  // Zoom-in cinemático al entrar en foco, zoom-out al salir.
  const firstFocusRun = useRef(true)
  useEffect(() => {
    if (firstFocusRun.current) { firstFocusRun.current = false; return }
    // Pequeño delay para que React aplique `hidden: true` en los nodos fuera del
    // subgrafo antes de que fitView calcule el bounding box.
    const t = window.setTimeout(() => {
      if (focusSets) {
        // Foco: fit al subgrafo con margen — zoom-in que resalta la cadena
        const ids = Array.from(focusSets.active).map((i) => ({ id: String(i) }))
        rf.fitView({
          nodes: ids,
          padding: 0.22,
          duration: 900,
          minZoom: 0.7,
          maxZoom: 1.6,
        })
      } else {
        // Salida del foco: no fit-all (achicaría todo). Volvemos al centroide
        // con zoom 0.9, igual que la vista inicial.
        const positions = rfNodes.map((n) => n.position)
        const xs = positions.map((p) => p.x)
        const ys = positions.map((p) => p.y)
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 110
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 50
        rf.setCenter(cx, cy, { zoom: 0.9, duration: 900 })
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [focusSets, rf, rfNodes])

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

  // Botón "Ajustar" — click una vez: fit-all real (para ver todo el bounding
  // box, aunque los nodos queden chicos). Click de nuevo: vuelve al centro con
  // zoom 0.9. Así el usuario alterna entre "vista completa" y "vista trabajable".
  const fitToggleRef = useRef<'fit' | 'work'>('work')
  const handleFit = () => {
    if (fitToggleRef.current === 'work') {
      rf.fitView({ padding: 0.08, duration: 600, minZoom: 0.2, maxZoom: 1.4 })
      fitToggleRef.current = 'fit'
    } else {
      const positions = rfNodes.map((n) => n.position)
      const xs = positions.map((p) => p.x)
      const ys = positions.map((p) => p.y)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2 + 110
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2 + 50
      rf.setCenter(cx, cy, { zoom: 0.9, duration: 600 })
      fitToggleRef.current = 'work'
    }
  }

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
              setSelectedId(id)
              if (view === 'graph') rf.fitView({ nodes: [{ id: String(id) }], duration: 400, minZoom: 0.6, maxZoom: 1.4 })
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
          <div className="canvas-spotlight" aria-hidden="true" />
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
            // No usamos fitView — arrancamos con zoom 0.9 centrado en el grafo
            // (ver initialCenter effect abajo). Es más legible que fit-all cuando
            // el grafo es ancho: los nodos se leen y el usuario panea para ver el
            // resto (como Figma / Miro).
            defaultViewport={{ x: 0, y: 0, zoom: 0.9 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.2}
            maxZoom={2.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#CFCFC9" />
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

          <Legend />
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
                setSelectedId(id)
                if (view === 'graph') rf.fitView({ nodes: [{ id: String(id) }], duration: 400, minZoom: 0.6, maxZoom: 1.4 })
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

function Legend() {
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
              <div className="legend-title">Participación</div>
              <div className="legend-edges">
                {tiers.map((tier) => (
                  <div key={tier} className="legend-edge">
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
