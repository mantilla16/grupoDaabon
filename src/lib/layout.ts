import dagre from 'dagre'
import { Position, type Node, type Edge } from '@xyflow/react'

const NODE_WIDTH = 190
const NODE_HEIGHT = 82

export function layoutGraph(nodes: Node[], edges: Edge[], direction: 'TB' | 'LR' = 'TB'): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  // Extra space between ranks + siblings so percentage pills never overlap
  g.setGraph({
    rankdir: direction,
    // Más compacto para que el grafo llene mejor la pantalla al hacer fit.
    // Antes: 280/180/120 → ahora 180/110/70. Reduce ~35% el bounding box total.
    ranksep: direction === 'TB' ? 180 : 220,
    nodesep: direction === 'TB' ? 110 : 90,
    edgesep: 70,
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
