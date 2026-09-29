import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data-db')
const DB_PATH = path.join(DATA_DIR, 'estructura.db')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id     INTEGER PRIMARY KEY,
    name   TEXT NOT NULL,
    nit    TEXT NOT NULL DEFAULT '',
    type   TEXT NOT NULL CHECK (type IN ('SAS','SCA','SA','PN','Otro')),
    notes  TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ownerships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    owned_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    weight       TEXT,
    notes        TEXT,
    updated_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(owner_id, owned_id)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`)

// --- Seed on first run only ---
const rowCount = db.prepare('SELECT COUNT(*) as n FROM companies').get().n
if (rowCount === 0) {
  console.log('[db] Empty database — seeding from data/graph.ts …')
  const seed = await loadSeedFromGraphTs()
  const insertCompany = db.prepare('INSERT INTO companies (id, name, nit, type) VALUES (?, ?, ?, ?)')
  const insertOwnership = db.prepare('INSERT INTO ownerships (owner_id, owned_id, weight) VALUES (?, ?, ?)')
  const seedTx = db.transaction(() => {
    for (const c of seed.nodes) insertCompany.run(c.id, c.name, c.nit ?? '', c.type)
    for (const e of seed.edges) insertOwnership.run(e.from, e.to, e.weight ?? null)
  })
  seedTx()
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('seeded_at', new Date().toISOString())
  console.log(`[db] Seeded ${seed.nodes.length} companies and ${seed.edges.length} ownerships.`)
}

async function loadSeedFromGraphTs() {
  // The graph.ts is source-of-truth for the FIRST seed only.
  // After that, the DB is authoritative — we NEVER re-seed.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'data', 'graph.ts'), 'utf8')
  const objectLiterals = [...src.matchAll(/\{[^{}]+\}/g)].map((m) => m[0])
  const nodes = []
  const edges = []
  for (const lit of objectLiterals) {
    const idM = /\bid:\s*(-?\d+)/.exec(lit)
    const nameM = /\bname:\s*'([^']*)'/.exec(lit)
    const nitM = /\bnit:\s*'([^']*)'/.exec(lit)
    const typeM = /\btype:\s*'([^']*)'/.exec(lit)
    const fromM = /\bfrom:\s*(-?\d+)/.exec(lit)
    const toM = /\bto:\s*(-?\d+)/.exec(lit)
    const weightM = /\bweight:\s*(?:'([^']*)'|(null))/.exec(lit)
    if (idM && nameM && typeM) {
      nodes.push({ id: Number(idM[1]), name: nameM[1], nit: nitM ? nitM[1] : '', type: typeM[1] })
    } else if (fromM && toM && weightM) {
      edges.push({
        from: Number(fromM[1]),
        to: Number(toM[1]),
        weight: weightM[2] === 'null' ? null : weightM[1],
      })
    }
  }
  return { nodes, edges }
}

// --- API ---
const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

// Trust the reverse proxy (nginx) so req.ip / X-Forwarded-* work correctly.
app.set('trust proxy', 1)

// GET whole graph (used by the client on load)
app.get('/api/graph', (_req, res) => {
  const nodes = db.prepare('SELECT id, name, nit, type FROM companies ORDER BY id').all()
  const edges = db.prepare(`
    SELECT id, owner_id AS "from", owned_id AS "to", weight
    FROM ownerships
    ORDER BY id
  `).all()
  res.json({ nodes, edges })
})

// Company CRUD
app.post('/api/companies', (req, res) => {
  const { name, nit, type } = req.body ?? {}
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' })
  const nextId = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM companies').get().n)
  db.prepare('INSERT INTO companies (id, name, nit, type) VALUES (?, ?, ?, ?)').run(nextId, name, nit ?? '', type)
  res.json({ id: nextId })
})

app.put('/api/companies/:id', (req, res) => {
  const id = Number(req.params.id)
  const { name, nit, type } = req.body ?? {}
  const info = db.prepare(`
    UPDATE companies
    SET name = COALESCE(?, name),
        nit  = COALESCE(?, nit),
        type = COALESCE(?, type),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(name ?? null, nit ?? null, type ?? null, id)
  res.json({ changes: info.changes })
})

app.delete('/api/companies/:id', (req, res) => {
  const id = Number(req.params.id)
  db.prepare('DELETE FROM companies WHERE id = ?').run(id)
  res.json({ ok: true })
})

// Ownership CRUD
app.post('/api/ownerships', (req, res) => {
  const { from, to, weight } = req.body ?? {}
  if (from == null || to == null) return res.status(400).json({ error: 'from and to are required' })
  if (from === to) return res.status(400).json({ error: 'owner and owned must differ' })
  try {
    const info = db.prepare('INSERT INTO ownerships (owner_id, owned_id, weight) VALUES (?, ?, ?)').run(from, to, weight ?? null)
    res.json({ id: info.lastInsertRowid })
  } catch (e) {
    if (String(e).includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Esa relación ya existe entre estos dos nodos' })
    }
    return res.status(500).json({ error: String(e) })
  }
})

app.put('/api/ownerships/:id', (req, res) => {
  const id = Number(req.params.id)
  const { from, to, weight } = req.body ?? {}
  const info = db.prepare(`
    UPDATE ownerships
    SET owner_id = COALESCE(?, owner_id),
        owned_id = COALESCE(?, owned_id),
        weight   = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(from ?? null, to ?? null, weight ?? null, id)
  res.json({ changes: info.changes })
})

app.delete('/api/ownerships/:id', (req, res) => {
  const id = Number(req.params.id)
  db.prepare('DELETE FROM ownerships WHERE id = ?').run(id)
  res.json({ ok: true })
})

// Take a proper WAL-aware snapshot of the current DB into a .bak.db beside it.
// Every destructive endpoint calls this FIRST so nothing is ever lost.
async function autoBackup(reason) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dst = path.join(DATA_DIR, `estructura.${stamp}.autobak.db`)
  try {
    db.pragma('wal_checkpoint(FULL)')
    await db.backup(dst)
    const n = db.prepare('SELECT COUNT(*) c FROM companies').get().c
    const e = db.prepare('SELECT COUNT(*) c FROM ownerships').get().c
    console.log(`[db] auto-backup before ${reason}: ${dst} (${n} nodes, ${e} edges)`)
    return dst
  } catch (err) {
    console.error(`[db] auto-backup FAILED for ${reason}:`, err)
    throw err
  }
}

// Bulk replace — used by the "Aplicar JSON" button
app.post('/api/replace', async (req, res) => {
  const { nodes, edges } = req.body ?? {}
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    return res.status(400).json({ error: 'nodes and edges arrays required' })
  }
  try { await autoBackup('replace') } catch { return res.status(500).json({ error: 'backup step failed — refused' }) }
  const tx = db.transaction(() => {
    db.exec('DELETE FROM ownerships; DELETE FROM companies;')
    const insertC = db.prepare('INSERT INTO companies (id, name, nit, type) VALUES (?, ?, ?, ?)')
    const insertE = db.prepare('INSERT INTO ownerships (owner_id, owned_id, weight) VALUES (?, ?, ?)')
    for (const n of nodes) insertC.run(n.id, n.name, n.nit ?? '', n.type)
    for (const e of edges) insertE.run(e.from, e.to, e.weight ?? null)
  })
  tx()
  res.json({ ok: true, nodes: nodes.length, edges: edges.length })
})

// Restore original: re-run the seed from graph.ts.
// PROTECTED: requires the client to send `confirm: "SI, BORRAR TODO"` in the
// body. That way no accidental / debug / robot call can wipe the DB — the user
// has to type the confirmation phrase into the app on purpose. Every call also
// takes an auto-backup first, so even confirmed wipes are recoverable.
app.post('/api/restore-original', async (req, res) => {
  const confirm = req.body?.confirm
  if (confirm !== 'SI, BORRAR TODO') {
    return res.status(400).json({
      error: 'Falta la frase de confirmación "SI, BORRAR TODO". Esto es a propósito para prevenir borrados accidentales.',
    })
  }
  let backupPath = null
  try { backupPath = await autoBackup('restore-original') } catch { return res.status(500).json({ error: 'backup step failed — refused' }) }
  const seed = await loadSeedFromGraphTs()
  const tx = db.transaction(() => {
    db.exec('DELETE FROM ownerships; DELETE FROM companies;')
    const insertC = db.prepare('INSERT INTO companies (id, name, nit, type) VALUES (?, ?, ?, ?)')
    const insertE = db.prepare('INSERT INTO ownerships (owner_id, owned_id, weight) VALUES (?, ?, ?)')
    for (const n of seed.nodes) insertC.run(n.id, n.name, n.nit ?? '', n.type)
    for (const e of seed.edges) insertE.run(e.from, e.to, e.weight ?? null)
  })
  tx()
  res.json({ ok: true, nodes: seed.nodes.length, edges: seed.edges.length, backup: backupPath })
})

// List all backups on disk — used by the "Recuperar" UI
app.get('/api/backups', (_req, res) => {
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.bak.db') || f.endsWith('.autobak.db'))
    .map((f) => {
      const full = path.join(DATA_DIR, f)
      const stat = fs.statSync(full)
      let nodes = 0, edges = 0
      try {
        const check = new Database(full, { readonly: true, fileMustExist: true })
        try {
          nodes = check.prepare('SELECT COUNT(*) c FROM companies').get().c
          edges = check.prepare('SELECT COUNT(*) c FROM ownerships').get().c
        } catch {}
        check.close()
      } catch {}
      return { file: f, size: stat.size, mtime: stat.mtime.toISOString(), nodes, edges }
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
  res.json({ backups: files })
})

// Restore from a specific backup file (with auto-backup + confirmation)
app.post('/api/restore-backup', async (req, res) => {
  const { file, confirm } = req.body ?? {}
  if (confirm !== 'SI, RESTAURAR') {
    return res.status(400).json({ error: 'Falta confirmación "SI, RESTAURAR".' })
  }
  if (!file || typeof file !== 'string' || file.includes('..') || file.includes('/') || file.includes('\\')) {
    return res.status(400).json({ error: 'nombre de archivo inválido' })
  }
  const src = path.join(DATA_DIR, file)
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'archivo no existe' })

  await autoBackup('restore-backup')
  const backup = new Database(src, { readonly: true, fileMustExist: true })
  try {
    const nodes = backup.prepare('SELECT id, name, nit, type FROM companies').all()
    const edges = backup.prepare('SELECT owner_id AS o, owned_id AS d, weight FROM ownerships').all()
    const tx = db.transaction(() => {
      db.exec('DELETE FROM ownerships; DELETE FROM companies;')
      const insertC = db.prepare('INSERT INTO companies (id, name, nit, type) VALUES (?, ?, ?, ?)')
      const insertE = db.prepare('INSERT INTO ownerships (owner_id, owned_id, weight) VALUES (?, ?, ?)')
      for (const n of nodes) insertC.run(n.id, n.name, n.nit ?? '', n.type)
      for (const e of edges) insertE.run(e.o, e.d, e.weight ?? null)
    })
    tx()
    res.json({ ok: true, nodes: nodes.length, edges: edges.length })
  } finally {
    backup.close()
  }
})

// Backup: returns the current DB snapshot as a JSON payload
app.get('/api/backup', (_req, res) => {
  const nodes = db.prepare('SELECT id, name, nit, type FROM companies ORDER BY id').all()
  const edges = db.prepare('SELECT owner_id AS "from", owned_id AS "to", weight FROM ownerships ORDER BY id').all()
  res.json({
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
  })
})

// Health check for the reverse proxy / uptime monitoring
app.get('/api/health', (_req, res) => {
  const nodes = db.prepare('SELECT COUNT(*) c FROM companies').get().c
  const edges = db.prepare('SELECT COUNT(*) c FROM ownerships').get().c
  res.json({ ok: true, nodes, edges, uptime: process.uptime() })
})

// --- Static file serving (production) ---
// In production we serve the Vite build from `dist/` on the same Node process.
// Nginx just proxies `/estructuradaabon/` to this port; no separate static file
// serving needed. In development this branch is skipped because `dist/` doesn't
// exist and Vite serves the client on its own port.
const DIST_DIR = path.join(ROOT, 'dist')
if (fs.existsSync(DIST_DIR)) {
  console.log(`[api] serving static build from ${DIST_DIR}`)
  app.use(express.static(DIST_DIR, {
    index: false,
    maxAge: '1h',
    setHeaders(res, filePath) {
      // Hashed assets (Vite adds a content hash) are immutable
      if (/\.[0-9a-f]{8,}\.(js|css|woff2?|png|jpg|jpeg|svg|webp)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    },
  }))
  // SPA fallback: any GET that isn't /api and isn't a static file → index.html
  app.get(/^\/(?!api\/).*$/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

// Fatal handlers — never fail silently
process.on('uncaughtException', (err) => {
  console.error('[api] uncaught exception:', err)
  process.exitCode = 1
})
process.on('unhandledRejection', (err) => {
  console.error('[api] unhandled rejection:', err)
  process.exitCode = 1
})

// Fixed backend port. We ignore process.env.PORT on purpose — some launchers
// (Vite, Vercel CLI, IDE previews) set PORT to the frontend's port, which would
// collide with the Vite dev server. Change here if you need a different port.
const PORT = 4001
const server = app.listen(PORT, () => {
  console.log(`[api] estructura-daabon SQLite server on http://localhost:${PORT}`)
  console.log(`[db]  file: ${DB_PATH}`)
})
server.on('error', (err) => {
  console.error(`[api] server error:`, err)
  if (err.code === 'EADDRINUSE') {
    console.error(`[api] Port ${PORT} is already in use. Free it or set PORT env var.`)
  }
  process.exit(1)
})

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[api] ${signal} received, closing server + DB…`)
  server.close(() => {
    try { db.close() } catch {}
    process.exit(0)
  })
  // Force exit if close hangs
  setTimeout(() => process.exit(0), 3000).unref()
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
