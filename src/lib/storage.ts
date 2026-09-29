import type { GraphData } from '../data/graph'

const KEY = 'daabon-graph-v2'

export function loadState(): GraphData | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as GraphData) : null
  } catch {
    return null
  }
}

export function saveState(data: GraphData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
