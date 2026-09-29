import dagre from 'dagre'
import { Position, type Node, type Edge } from '@xyflow/react'

const NODE_WIDTH = 220
const NODE_HEIGHT = 100

export function layoutGraph(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // Extra space between ranks + siblings so percentage pills never overlap
  g.setGraph({
    rankdir: direction,
    // Espaciado equilibrado: suficiente aire para leer flechas y % sin apilarse,
    // sin inflar el bounding box (los nodos son 220×100 así que el % relativo es
    // similar al original con 240×96).
    ranksep: direction === 'TB' ? 160 : 200,
    nodesep: direction === 'TB' ? 90 : 80,
    edgesep: 50,
    marginx: 40,
    marginy: 40,
  })

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    return {
      ...n,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      targetPosition: direction === 'TB' ? Position.Top : Position.Left,
      sourcePosition: direction === 'TB' ? Position.Bottom : Position.Right,
    }
  })
}
