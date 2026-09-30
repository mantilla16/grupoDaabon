import dagre from 'dagre'
import { Position, type Node, type Edge } from '@xyflow/react'

/**
 * Layout portado del prototipo `design_handoff_grafo_daabon/Estructura Grupo
 * Daabon.dc.html` (§1 del handoff). El objetivo es que:
 *
 *   1) las etiquetas de % entren al layout de dagre (labelpos 'c') → dagre les
 *      reserva espacio y ya no se encima el pill al centro de la arista.
 *   2) cada arista devuelva sus `points` intermedios + `labelX/labelY` para que
 *      el custom edge pueda hacer routing ortogonal exacto (§2).
 *   3) los componentes conexos de ≤3 nodos se agrupen en un bloque
 *      "Estructuras independientes" empaquetado en cuadrícula (evita el vacío
 *      arriba a la izquierda cuando hay parejas sueltas como Cacata → Caribbean).
 */

export const NODE_WIDTH = 224
export const NODE_HEIGHT = 96

export interface EdgeGeometry {
  points: { x: number; y: number }[]
  labelX: number
  labelY: number
}

export interface IndependentFrame {
  x: number
  y: number
  w: number
  h: number
  count: number
}

export interface LayoutResult {
  positions: Map<string, { x: number; y: number }>
  edges: Map<number, EdgeGeometry>
  ranks: Map<string, number>
  frame: IndependentFrame | null
  bounds: { x: number; y: number; w: number; h: number }
}

interface LayoutEdgeInput {
  index: number
  from: string
  to: string
  label: string
}

// ---------------------------------------------------------------------------
// dagreLayout — un componente conectado
// ---------------------------------------------------------------------------
interface PartialLayout {
  nodes: Record<string, { x: number; y: number }>
  edges: Record<number, EdgeGeometry>
  w: number
  h: number
}

function dagreLayout(
  ids: string[],
  eds: LayoutEdgeInput[],
  dir: 'TB' | 'LR',
): PartialLayout {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: dir,
    // Valores del prototipo — dagre duplica los ranks cuando hay labels con
    // labelpos 'c', así que los ranksep de aquí se sienten al doble.
    nodesep: dir === 'TB' ? 26 : 18,
    ranksep: dir === 'TB' ? 24 : 30,
    edgesep: 12,
    marginx: 0,
    marginy: 0,
  })
  g.setDefaultEdgeLabel(() => ({}))
  ids.forEach((id) => g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  eds.forEach((e) => {
    g.setEdge(
      e.from,
      e.to,
      {
        // Ancho estimado del pill: base 18 + ~6.9px por char
        width: 18 + e.label.length * 6.9,
        height: 24,
        labelpos: 'c',
      },
      'e' + e.index,
    )
  })

  dagre.layout(g)

  const nodes: PartialLayout['nodes'] = {}
  ids.forEach((id) => {
    const n = g.node(id)
    nodes[id] = { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 }
  })
  const edges: PartialLayout['edges'] = {}
  eds.forEach((e) => {
    const d = g.edge(e.from, e.to, 'e' + e.index) as unknown as {
      points: { x: number; y: number }[]
      x: number
      y: number
    }
    edges[e.index] = {
      points: (d.points ?? []).map((p) => ({ x: p.x, y: p.y })),
      labelX: d.x ?? 0,
      labelY: d.y ?? 0,
    }
  })
  const gr = g.graph()
  return { nodes, edges, w: gr.width ?? NODE_WIDTH, h: gr.height ?? NODE_HEIGHT }
}

// Traslada un layout parcial y lo escribe sobre los mapas globales.
function shift(
  part: PartialLayout,
  dx: number,
  dy: number,
  nodes: Record<string, { x: number; y: number }>,
  edges: Record<number, EdgeGeometry>,
) {
  Object.keys(part.nodes).forEach((id) => {
    const p = part.nodes[id]
    nodes[id] = { x: p.x + dx, y: p.y + dy }
  })
  Object.keys(part.edges).forEach((k) => {
    const i = Number(k)
    const e = part.edges[i]
    edges[i] = {
      points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      labelX: e.labelX + dx,
      labelY: e.labelY + dy,
    }
  })
}

// ---------------------------------------------------------------------------
// computeLayout — separa "grupo principal" (>3 nodos) del bloque de
// componentes independientes (≤3 nodos) y los empaqueta al costado o abajo,
// eligiendo la disposición que mejor calce con el aspecto del canvas.
// ---------------------------------------------------------------------------
export function computeLayout(
  ids: string[],
  eds: LayoutEdgeInput[],
  dir: 'TB' | 'LR',
  group: boolean,
  aspect: number,
): { nodes: Record<string, { x: number; y: number }>; edges: Record<number, EdgeGeometry>; frame: IndependentFrame | null } {
  const single = () => {
    const r = dagreLayout(ids, eds, dir)
    return { nodes: r.nodes, edges: r.edges, frame: null }
  }
  if (!group) return single()

  // Union-find sobre las aristas para encontrar componentes conexos
  const parent: Record<string, string> = {}
  ids.forEach((i) => (parent[i] = i))
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  eds.forEach((e) => { parent[find(e.from)] = find(e.to) })
  const compsMap: Record<string, string[]> = {}
  ids.forEach((i) => {
    const root = find(i)
    ;(compsMap[root] = compsMap[root] || []).push(i)
  })
  const list = Object.values(compsMap)
  const big = list.filter((c) => c.length > 3)
  const small = list.filter((c) => c.length <= 3)
  if (!big.length || !small.length) return single()

  const bigIds = big.flat()
  const bigSet = new Set(bigIds)
  const main = dagreLayout(bigIds, eds.filter((e) => bigSet.has(e.from) && bigSet.has(e.to)), dir)
  const parts = small
    .slice()
    .sort((a, b) => b.length - a.length)
    .map((c) => {
      const cSet = new Set(c)
      return dagreLayout(c, eds.filter((e) => cSet.has(e.from) && cSet.has(e.to)), dir)
    })

  const GX = 36, GY = 36, PAD = 28, HEAD = 58, GAP = 110
  let best: {
    score: number
    rows: PartialLayout[][]
    rh: number[]
    bw: number
    bh: number
    side: 'right' | 'below'
  } | null = null

  for (let cols = 1; cols <= parts.length; cols++) {
    const rows: PartialLayout[][] = []
    for (let i = 0; i < parts.length; i += cols) rows.push(parts.slice(i, i + cols))
    const rw = rows.map((r) => r.reduce((s, p) => s + p.w, 0) + GX * (r.length - 1))
    const rh = rows.map((r) => Math.max(...r.map((p) => p.h)))
    const bw = Math.max(...rw) + PAD * 2
    const bh = rh.reduce((a, b) => a + b, 0) + GY * (rows.length - 1) + PAD + HEAD
    for (const side of ['right', 'below'] as const) {
      const W = side === 'right' ? main.w + GAP + bw : Math.max(main.w, bw)
      const H = side === 'right' ? Math.max(main.h, bh) : main.h + GAP + bh
      const score = Math.abs(Math.log(W / H / (aspect || 1.75)))
      if (!best || score < best.score) best = { score, rows, rh, bw, bh, side }
    }
  }
  if (!best) return single()

  const nodes: Record<string, { x: number; y: number }> = {}
  const edges: Record<number, EdgeGeometry> = {}
  shift(main, 0, 0, nodes, edges)
  const bx = best.side === 'right' ? main.w + GAP : 0
  const by = best.side === 'right' ? 0 : main.h + GAP
  let y = by + HEAD
  best.rows.forEach((r, ri) => {
    let x = bx + PAD
    r.forEach((p) => {
      shift(p, x, y + (best!.rh[ri] - p.h) / 2, nodes, edges)
      x += p.w + GX
    })
    y += best!.rh[ri] + GY
  })

  const frame: IndependentFrame = {
    x: bx,
    y: by,
    w: best.bw,
    h: best.bh,
    count: small.length,
  }
  return { nodes, edges, frame }
}

// ---------------------------------------------------------------------------
// API pública consumida por App.tsx
// ---------------------------------------------------------------------------
export interface LayoutInput {
  nodeIds: (string | number)[]
  edges: { index: number; from: number; to: number; label: string }[]
  direction: 'TB' | 'LR'
  group: boolean
  canvasWidth: number
  canvasHeight: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function computeGraphLayout(input: LayoutInput): LayoutResult {
  const ids = input.nodeIds.map(String)
  const eds: LayoutEdgeInput[] = input.edges.map((e) => ({
    index: e.index,
    from: String(e.from),
    to: String(e.to),
    label: e.label,
  }))
  const aspect =
    input.canvasWidth > 1
      ? clamp((input.canvasWidth - 128) / (input.canvasHeight - 158), 0.8, 3)
      : 1.75
  const res = computeLayout(ids, eds, input.direction, input.group, aspect)

  const positions = new Map<string, { x: number; y: number }>()
  Object.keys(res.nodes).forEach((id) => positions.set(id, res.nodes[id]))
  const edgeGeo = new Map<number, EdgeGeometry>()
  Object.keys(res.edges).forEach((k) => edgeGeo.set(Number(k), res.edges[Number(k)]))

  // Rank = índice del nivel del nodo en el eje principal (para la coreografía)
  const axis = (p: { x: number; y: number }) => Math.round(input.direction === 'TB' ? p.y : p.x)
  const levels = Array.from(
    new Set(ids.map((id) => axis(positions.get(id) ?? { x: 0, y: 0 }))),
  ).sort((a, b) => a - b)
  const ranks = new Map<string, number>()
  ids.forEach((id) => {
    const lvl = axis(positions.get(id) ?? { x: 0, y: 0 })
    ranks.set(id, levels.indexOf(lvl))
  })

  // Bounding box del grafo (incluye el marco del bloque independiente)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  ids.forEach((id) => {
    const p = positions.get(id)
    if (!p) return
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x + NODE_WIDTH)
    y1 = Math.max(y1, p.y + NODE_HEIGHT)
  })
  if (res.frame) {
    x0 = Math.min(x0, res.frame.x)
    y0 = Math.min(y0, res.frame.y)
    x1 = Math.max(x1, res.frame.x + res.frame.w)
    y1 = Math.max(y1, res.frame.y + res.frame.h)
  }
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = NODE_WIDTH; y1 = NODE_HEIGHT }

  return {
    positions,
    edges: edgeGeo,
    ranks,
    frame: res.frame,
    bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
  }
}

// ---------------------------------------------------------------------------
// Compat legacy: React Flow todavía llama a layoutGraph. Lo mantenemos como
// wrapper delgado sobre computeGraphLayout usando las mismas medidas nuevas.
// ---------------------------------------------------------------------------
export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
): Node[] {
  const layout = computeGraphLayout({
    nodeIds: nodes.map((n) => n.id),
    edges: edges.map((e, i) => ({
      index: i,
      from: Number(e.source),
      to: Number(e.target),
      label: '',
    })),
    direction,
    // El wrapper legacy no agrupa — la coreografía completa se orquesta desde
    // App.tsx llamando directamente a computeGraphLayout con el flag.
    group: false,
    canvasWidth: 0,
    canvasHeight: 0,
  })

  return nodes.map((n) => {
    const pos = layout.positions.get(String(n.id)) ?? { x: 0, y: 0 }
    return {
      ...n,
      position: pos,
      targetPosition: direction === 'TB' ? Position.Top : Position.Left,
      sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
    }
  })
}
