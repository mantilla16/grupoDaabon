import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { GraphData } from '../data/graph'
import { AnimatedNumber } from './AnimatedNumber'
import { EASE_OUT } from '../lib/theme'

interface Props {
  open: boolean
  data: GraphData
  onClose: () => void
  onImport: (data: GraphData) => void
  onReset: () => void
  onToast: (msg: string) => void
}

export function DataDrawer({ open, data, onClose, onImport, onReset, onToast }: Props) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) {
      setText(JSON.stringify(data, null, 2))
    }
  }, [open, data])

  const stats = {
    nodes: data.nodes.length,
    edges: data.edges.length,
    withoutWeight: data.edges.filter((e) => !e.weight).length,
    roots: data.nodes.filter((n) => !data.edges.some((e) => e.to === n.id)).length,
    leaves: data.nodes.filter((n) => !data.edges.some((e) => e.from === n.id)).length,
  }

  const handleImport = () => {
    try {
      const parsed = JSON.parse(text)
      if (!parsed.nodes || !parsed.edges) throw new Error('El JSON necesita las claves "nodes" y "edges".')
      onImport(parsed)
      onToast('Datos importados correctamente')
      onClose()
    } catch (e) {
      onToast('Error: ' + (e as Error).message)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      onToast('JSON copiado al portapapeles')
    } catch {
      onToast('No se pudo copiar; selecciona el texto y usa Ctrl+C.')
    }
  }

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'estructura-daabon.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onToast('Archivo descargado')
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const section = {
    hidden: { opacity: 0, x: 24 },
    show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE_OUT } },
  }

  return (
    <AnimatePresence>
    {open && (
    <motion.div className="drawer-backdrop" onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { delay: 0.1 } }}>
      <motion.aside className="drawer" onClick={(e) => e.stopPropagation()}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%', transition: { duration: 0.28, ease: [0.4, 0, 1, 1] } }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}>
        <header className="drawer-head">
          <div>
            <div className="drawer-eyebrow">Datos y respaldo</div>
            <h2 className="drawer-title">Estado actual del papel</h2>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        </header>

        <motion.div className="drawer-body" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}>
          <motion.section className="drawer-section" variants={section}>
            <h3 className="drawer-section-title">Resumen</h3>
            <div className="stats-grid">
              <StatCard label="Compañías" value={stats.nodes} i={0} />
              <StatCard label="Relaciones" value={stats.edges} i={1} />
              <StatCard label="Sin %" value={stats.withoutWeight} tone={stats.withoutWeight > 0 ? 'warn' : 'ok'} i={2} />
              <StatCard label="Raíces" value={stats.roots} i={3} />
              <StatCard label="Sin participadas" value={stats.leaves} i={4} />
            </div>
          </motion.section>

          <motion.section className="drawer-section" variants={section}>
            <h3 className="drawer-section-title">Exportar / Importar</h3>
            <p className="drawer-section-hint">
              Copia el JSON para respaldarlo, o pégalo y aplica cambios para reemplazar toda la estructura.
            </p>
            <textarea
              className="drawer-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
            />
            <div className="drawer-buttons">
              <button className="btn" onClick={handleCopy}>Copiar</button>
              <button className="btn" onClick={handleDownload}>Descargar</button>
              <button className="btn btn-primary" onClick={handleImport}>Aplicar JSON</button>
            </div>
          </motion.section>

          <motion.section className="drawer-section" variants={section}>
            <h3 className="drawer-section-title">Restablecer</h3>
            <p className="drawer-section-hint">
              Vuelve a los datos originales extraídos del Excel. Se pierden los cambios locales.
            </p>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm('¿Restaurar los datos originales? Los cambios locales se perderán.')) {
                  onReset()
                  onClose()
                  onToast('Datos restaurados a la versión original')
                }
              }}
            >
              Restaurar original
            </button>
          </motion.section>
        </motion.div>
      </motion.aside>
    </motion.div>
    )}
    </AnimatePresence>
  )
}

function StatCard({ label, value, tone, i }: { label: string; value: number; tone?: 'ok' | 'warn'; i: number }) {
  return (
    <motion.div
      className={'stat-card' + (tone ? ` tone-${tone}` : '')}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 + i * 0.06, duration: 0.5, ease: EASE_OUT }}
    >
      <div className="stat-value"><AnimatedNumber value={value} delay={0.3 + i * 0.06} pad={2} /></div>
      <div className="stat-label">{label}</div>
    </motion.div>
  )
}
