// Kill anything listening on ports we care about — Windows-safe.
import { execSync } from 'node:child_process'

const PORTS = process.argv.slice(2).map(Number).filter(Boolean)
if (PORTS.length === 0) PORTS.push(5173, 4001)

for (const port of PORTS) {
  let netstat = ''
  try {
    netstat = execSync('netstat -ano', { stdio: ['ignore', 'pipe', 'ignore'] }).toString()
  } catch { continue }
  const pids = new Set()
  for (const line of netstat.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    if (!/LISTENING/i.test(t)) continue
    if (!new RegExp(`:${port}\\b`).test(t)) continue
    const pid = t.split(/\s+/).pop()
    if (/^\d+$/.test(pid)) pids.add(pid)
  }
  if (pids.size === 0) {
    console.log(`port ${port}: free`)
    continue
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: ['ignore', 'ignore', 'ignore'] })
      console.log(`port ${port}: killed PID ${pid}`)
    } catch (e) {
      console.log(`port ${port}: could not kill PID ${pid} (${e.message.trim()})`)
    }
  }
}
