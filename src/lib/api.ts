import type { EntityType, GraphData } from '../data/graph'

/**
 * All persistence goes through this module. Data lives in a SQLite file on disk
 * (server/), NOT in localStorage. Multiple tabs, multiple ports, code refactors
 * — none of that touches the DB.
 *
 * Behind nginx at /estructuradaabon/ the Vite build ships with
 * `import.meta.env.BASE_URL === '/estructuradaabon/'`; every request the client
 * makes has to be prefixed the same way so nginx can dispatch it. In dev the
 * base is '/' so this is a no-op.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '') // '' locally, '/estructuradaabon' in prod
const api = (path: string) => `${BASE}${path}`

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { /* ignore */ }
    const msg = body && typeof body === 'object' && 'error' in body
      ? String((body as { error: unknown }).error)
      : `${res.status} ${res.statusText}`
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export async function fetchGraph(): Promise<GraphData> {
  const res = await fetch(api('/api/graph'))
  return j<GraphData>(res)
}

export async function createCompany(input: { name: string; nit: string; type: EntityType }): Promise<{ id: number }> {
  const res = await fetch(api('/api/companies'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return j(res)
}

export async function updateCompany(id: number, input: { name?: string; nit?: string; type?: EntityType }): Promise<void> {
  const res = await fetch(api(`/api/companies/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await j(res)
}

export async function deleteCompany(id: number): Promise<void> {
  const res = await fetch(api(`/api/companies/${id}`), { method: 'DELETE' })
  await j(res)
}

export async function createOwnership(input: { from: number; to: number; weight: string | null }): Promise<{ id: number }> {
  const res = await fetch(api('/api/ownerships'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return j(res)
}

export async function updateOwnership(id: number, input: { from?: number; to?: number; weight?: string | null }): Promise<void> {
  const res = await fetch(api(`/api/ownerships/${id}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await j(res)
}

export async function deleteOwnership(id: number): Promise<void> {
  const res = await fetch(api(`/api/ownerships/${id}`), { method: 'DELETE' })
  await j(res)
}

export async function replaceGraph(data: GraphData): Promise<void> {
  const res = await fetch(api('/api/replace'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  await j(res)
}

export async function restoreOriginal(): Promise<void> {
  // Server refuses without the confirmation phrase. The UI collects it explicitly.
  const res = await fetch(api('/api/restore-original'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'SI, BORRAR TODO' }),
  })
  await j(res)
}

export async function backup(): Promise<{ exportedAt: string; nodes: unknown[]; edges: unknown[] }> {
  const res = await fetch(api('/api/backup'))
  return j(res)
}

export interface BackupEntry {
  file: string
  size: number
  mtime: string
  nodes: number
  edges: number
}
export async function listBackups(): Promise<BackupEntry[]> {
  const res = await fetch(api('/api/backups'))
  const { backups } = await j<{ backups: BackupEntry[] }>(res)
  return backups
}

export async function restoreFromBackup(file: string): Promise<void> {
  const res = await fetch(api('/api/restore-backup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, confirm: 'SI, RESTAURAR' }),
  })
  await j(res)
}
