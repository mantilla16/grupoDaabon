import type { EntityType } from '../data/graph'

/** Visual palette — only presentation. Data (companies / relations) lives in data/graph.ts. */
export const TYPE_COLOR: Record<EntityType, string> = {
  SAS: '#2C5A86',
  SCA: '#7B3A5E',
  SA: '#9A7318',
  PN: '#B04E2A',
  Otro: '#6A6A72',
}

export type Tier = 'ctrl' | 'sig' | 'minor' | 'missing'

export function parseWeight(w: string | null): number {
  if (!w) return 0
  return parseFloat(w.replace(',', '.')) || 0
}

export function tierFor(w: string | null): Tier {
  if (!w) return 'missing'
  const n = parseFloat(w.replace(',', '.'))
  if (Number.isNaN(n)) return 'missing'
  if (n >= 50) return 'ctrl'
  if (n >= 5) return 'sig'
  return 'minor'
}

export const TIER_STYLE: Record<Tier, { stroke: string; width: number; label: string }> = {
  // Trazos más delgados para no dominar el grafo cuando hay muchas flechas en pantalla.
  ctrl: { stroke: '#1F5E4A', width: 1.8, label: '≥ 50 % · control' },
  sig: { stroke: '#9A6A22', width: 1.3, label: '5 – 50 %' },
  minor: { stroke: '#A3A39C', width: 0.9, label: '< 5 %' },
  missing: { stroke: '#7A1F32', width: 1.1, label: 'Sin % declarado' },
}

export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const
export const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const
export const SPRING_SOFT = { type: 'spring', stiffness: 220, damping: 28 } as const
