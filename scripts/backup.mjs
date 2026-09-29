// Proper SQLite backup — uses better-sqlite3's online backup API
// which handles WAL correctly. Never use fs.copyFileSync on a live SQLite
// file in WAL mode: recent changes live in the .db-wal sidecar and get
// silently omitted.
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_PATH = path.join(ROOT, 'data-db', 'estructura.db')
const BACKUP_DIR = path.join(ROOT, 'data-db')

if (!fs.existsSync(DB_PATH)) {
  console.error(`No DB found at ${DB_PATH}. Nothing to back up.`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dst = path.join(BACKUP_DIR, `estructura.${stamp}.bak.db`)

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
try {
  // 1) Force any pending WAL frames into the main file
  db.pragma('wal_checkpoint(FULL)')
  // 2) Copy the entire live database (schema + rows) to `dst`
  await db.backup(dst)
  // 3) Verify the backup opened correctly and has real data
  const check = new Database(dst, { readonly: true, fileMustExist: true })
  const nodes = check.prepare('SELECT COUNT(*) c FROM companies').get().c
  const edges = check.prepare('SELECT COUNT(*) c FROM ownerships').get().c
  check.close()
  console.log(`Backup: ${dst}`)
  console.log(`  ${nodes} companies, ${edges} ownerships`)
} finally {
  db.close()
}
