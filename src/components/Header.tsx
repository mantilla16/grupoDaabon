import { motion, AnimatePresence } from 'motion/react'
import { EASE_OUT, SPRING } from '../lib/theme'
import { AnimatedNumber } from './AnimatedNumber'

interface Props {
  onNewCompany: () => void
  onNewEdge: () => void
  onFit: () => void
  onDataMenu: () => void
  layout: 'TB' | 'LR'
  onToggleLayout: () => void
  view: 'graph' | 'tree'
  onSetView: (v: 'graph' | 'tree') => void
  companies: number
  relations: number
  missing: number
}

const draw = (delay: number) => ({
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { pathLength: { duration: 0.9, delay, ease: EASE_OUT }, opacity: { duration: 0.01, delay } },
})

function BrandMark() {
  return (
    <svg viewBox="0 0 36 36" fill="none" className="brand-mark" aria-hidden="true">
      <motion.rect x="12" y="3" width="12" height="9" rx="2" fill="var(--brand)"
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.05 }} style={{ transformOrigin: '18px 7.5px' }} />
      <motion.path d="M18 12v6M8 18h20M8 18v5M28 18v5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" {...draw(0.25)} />
      <motion.rect x="2.5" y="23" width="11" height="9" rx="2" stroke="var(--ink)" strokeWidth="1.6"
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.7 }} style={{ transformOrigin: '8px 27.5px' }} />
      <motion.rect x="22.5" y="23" width="11" height="9" rx="2" fill="var(--ink)"
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.8 }} style={{ transformOrigin: '28px 27.5px' }} />
    </svg>
  )
}

function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <span className={'reveal ' + (className ?? '')}>
      <motion.span
        className="reveal-inner"
        initial={{ y: '110%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      >
        {children}
      </motion.span>
    </span>
  )
}

export function Header({
  onNewCompany, onNewEdge, onFit, onDataMenu, layout, onToggleLayout, view, onSetView,
  companies, relations, missing,
}: Props) {
  return (
    <header className="app-header">
      <div className="brand">
        <BrandMark />
        <div className="brand-text">
          <Reveal delay={0.15} className="brand-eyebrow">Papel de trabajo · Composición accionaria</Reveal>
          <h1 className="brand-title">
            <Reveal delay={0.25}>Estructura del</Reveal>{' '}
            <Reveal delay={0.33}><strong>Grupo Daabon</strong></Reveal>
          </h1>
        </div>
      </div>

      <motion.dl
        className="header-stats"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        <div className="hstat">
          <dt>Compañías</dt>
          <dd><AnimatedNumber value={companies} delay={0.55} /></dd>
        </div>
        <div className="hstat">
          <dt>Relaciones</dt>
          <dd><AnimatedNumber value={relations} delay={0.65} /></dd>
        </div>
        <div className={'hstat' + (missing > 0 ? ' is-warn' : '')}>
          <dt>Sin %</dt>
          <dd><AnimatedNumber value={missing} delay={0.75} /></dd>
        </div>
      </motion.dl>

      <motion.div
        className="header-actions"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.6, ease: EASE_OUT }}
      >
        <div className="segmented" role="tablist" aria-label="Vista">
          {(['graph', 'tree'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={'segmented-btn' + (view === v ? ' is-active' : '')}
              onClick={() => onSetView(v)}
            >
              {view === v && <motion.span layoutId="seg-indicator" className="segmented-indicator" transition={SPRING} />}
              <span className="segmented-content">
                {v === 'graph' ? (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="4.5" r="2.2" /><circle cx="4.5" cy="15.5" r="2.2" /><circle cx="15.5" cy="15.5" r="2.2" /><path d="M9 6.5 5.5 13.5M11 6.5l3.5 7" /></svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 4.5h12M7 10h9M10 15.5h6M4 4.5v11h3M7 10v5.5" /></svg>
                )}
                {v === 'graph' ? 'Grafo' : 'Árbol'}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {view === 'graph' && (
            <motion.div
              key="graph-tools"
              className="tool-group"
              initial={{ opacity: 0, x: 12, filter: 'blur(4px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 12, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              <button className="icon-btn" onClick={onToggleLayout} title={layout === 'TB' ? 'Cambiar a horizontal' : 'Cambiar a vertical'}>
                <motion.svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"
                  animate={{ rotate: layout === 'TB' ? 0 : -90 }} transition={SPRING}>
                  <rect x="7" y="2.5" width="6" height="4" rx="1" />
                  <rect x="2.5" y="13.5" width="6" height="4" rx="1" />
                  <rect x="11.5" y="13.5" width="6" height="4" rx="1" />
                  <path d="M10 6.5v3.5M5.5 13.5V10h9v3.5" />
                </motion.svg>
                <span className="icon-btn-label">{layout === 'TB' ? 'Vertical' : 'Horizontal'}</span>
              </button>
              <button className="icon-btn" onClick={onFit} title="Ajustar vista">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" /></svg>
                <span className="icon-btn-label">Ajustar</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button className="icon-btn" onClick={onDataMenu} title="Datos y respaldo">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="10" cy="4.5" rx="6.5" ry="2.5" /><path d="M3.5 4.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" /></svg>
          <span className="icon-btn-label">Datos</span>
        </button>

        <span className="header-divider" />

        <motion.button className="btn" onClick={onNewEdge} whileTap={{ scale: 0.96 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 10h13M11.5 5.5 16 10l-4.5 4.5" /></svg>
          Participación
        </motion.button>
        <motion.button className="btn btn-primary" onClick={onNewCompany} whileTap={{ scale: 0.96 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" /></svg>
          Compañía
        </motion.button>
      </motion.div>
    </header>
  )
}
