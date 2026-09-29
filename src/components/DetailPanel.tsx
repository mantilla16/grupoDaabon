import { useMemo } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Company, GraphData } from '../data/graph'
import { TYPE_META } from '../data/graph'
import { TYPE_COLOR, EASE_OUT, parseWeight, tierFor } from '../lib/theme'
import { AnimatedNumber } from './AnimatedNumber'

interface Props {
  data: GraphData
  selectedId: number | null
  onSelect: (id: number) => void
  onFocus: (id: number) => void
  onEditCompany: (id: number) => void
  onDeleteCompany: (id: number) => void
  onEditEdge: (index: number) => void
  onNewEdge: (fromId?: number, toId?: number) => void
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
}
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } },
}

export function DetailPanel(props: Props) {
  const { data, selectedId } = props
  const selected = useMemo(
    () => (selectedId != null ? data.nodes.find((n) => n.id === selectedId) ?? null : null),
    [data.nodes, selectedId],
  )

  return (
    <AnimatePresence mode="wait">
      {selected ? (
        <Detail key={selected.id} {...props} selected={selected} />
      ) : (
        <motion.div
          key="empty"
          className="detail-empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="detail-empty-art" aria-hidden="true">
            <svg viewBox="0 0 120 90" fill="none">
              <motion.path d="M60 22v16M28 38h64M28 38v14M92 38v14M60 38v14" stroke="var(--rule-2)" strokeWidth="1.4" strokeLinecap="round"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, delay: 0.3, ease: EASE_OUT }} />
              <motion.rect x="46" y="6" width="28" height="16" rx="3" fill="var(--brand)"
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }} style={{ transformOrigin: '60px 14px' }} />
              {[14, 46, 78].map((x, i) => (
                <motion.rect key={x} x={x} y="52" width="28" height="16" rx="3" stroke="var(--ink-4)" strokeWidth="1.4" fill="var(--surface)"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 + i * 0.1, duration: 0.5, ease: EASE_OUT }} />
              ))}
              <motion.circle r="3" fill="var(--brand)"
                animate={{ cx: [60, 60, 28, 28], cy: [22, 38, 38, 52], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.6, delay: 1.6, ease: 'easeInOut' }} />
            </svg>
          </div>
          <p className="detail-empty-title">Selecciona una compañía</p>
          <p className="detail-empty-sub">
            Haz clic en un nodo del mapa o en la lista para ver sus dueños, sus participadas y el porcentaje declarado.
            Doble clic enfoca la cadena completa.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Detail({
  data, selected, onSelect, onFocus, onEditCompany, onDeleteCompany, onEditEdge, onNewEdge,
}: Props & { selected: Company }) {
  const owners = useMemo(
    () => data.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.to === selected.id),
    [data.edges, selected.id],
  )
  const owned = useMemo(
    () => data.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.from === selected.id),
    [data.edges, selected.id],
  )

  const meta = TYPE_META[selected.type]
  const sumOwners = owners.reduce((a, { e }) => a + parseWeight(e.weight), 0)
  const sumOwned = owned.reduce((a, { e }) => a + parseWeight(e.weight), 0)

  return (
    <motion.div
      className="detail"
      style={{ '--tc': TYPE_COLOR[selected.type] } as React.CSSProperties}
      variants={container}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <motion.div className="detail-head" variants={item}>
        <div className="detail-eyebrow">
          <span className="detail-pill">{meta.short}</span>
          <span className="detail-eyebrow-text">{meta.label}</span>
        </div>
        <h2 className="detail-name">{selected.name}</h2>
        <div className="detail-nit">{selected.nit || 'Sin identificación'}</div>
      </motion.div>

      <motion.div className="detail-actions" variants={item}>
        <motion.button className="btn btn-primary" onClick={() => onFocus(selected.id)} whileTap={{ scale: 0.96 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="3" /><path d="M10 2.5v3M10 14.5v3M2.5 10h3M14.5 10h3" strokeLinecap="round" /></svg>
          Enfocar cadena
        </motion.button>
        <motion.button className="btn" onClick={() => onEditCompany(selected.id)} whileTap={{ scale: 0.96 }}>Editar</motion.button>
        <motion.button className="btn btn-danger-ghost" onClick={() => onDeleteCompany(selected.id)} whileTap={{ scale: 0.96 }} title="Eliminar compañía">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" strokeLinejoin="round" /></svg>
        </motion.button>
      </motion.div>

      <motion.div className="detail-metrics" variants={item}>
        <Metric label="Dueños" count={owners.length} pct={sumOwners} />
        <Metric label="Participadas" count={owned.length} pct={sumOwned} />
      </motion.div>

      <motion.div variants={item}>
        <RelSection
          title="Dueños"
          subtitle="Quién posee a esta compañía"
          icon="in"
          items={owners.map(({ e, i }) => ({ other: data.nodes.find((n) => n.id === e.from)!, weight: e.weight, index: i }))}
          emptyText="Sin dueños registrados."
          onSelectOther={onSelect}
          onEditEdge={onEditEdge}
          onAdd={() => onNewEdge(undefined, selected.id)}
        />
      </motion.div>

      <motion.div variants={item}>
        <RelSection
          title="Participadas"
          subtitle="Dónde invierte esta compañía"
          icon="out"
          items={owned.map(({ e, i }) => ({ other: data.nodes.find((n) => n.id === e.to)!, weight: e.weight, index: i }))}
          emptyText="Sin participaciones registradas."
          onSelectOther={onSelect}
          onEditEdge={onEditEdge}
          onAdd={() => onNewEdge(selected.id)}
        />
      </motion.div>
    </motion.div>
  )
}

function Metric({ label, count, pct }: { label: string; count: number; pct: number }) {
  const clamped = Math.min(pct, 100)
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value"><AnimatedNumber value={count} delay={0.15} pad={2} /></div>
      <div className="metric-bar"><motion.span initial={{ width: 0 }} animate={{ width: `${clamped}%` }} transition={{ duration: 1, delay: 0.3, ease: EASE_OUT }} /></div>
      <div className="metric-sub"><AnimatedNumber value={pct} decimals={2} delay={0.3} />% declarado</div>
    </div>
  )
}

interface RelItemProps {
  other: Company
  weight: string | null
  index: number
}
interface RelSectionProps {
  title: string
  subtitle: string
  icon: 'in' | 'out'
  items: RelItemProps[]
  emptyText: string
  onSelectOther: (id: number) => void
  onEditEdge: (index: number) => void
  onAdd: () => void
}

function RelSection({ title, subtitle, icon, items, emptyText, onSelectOther, onEditEdge, onAdd }: RelSectionProps) {
  return (
    <section className="rel-section">
      <header className="rel-head">
        <span className={'rel-arrow ' + icon}>
          {icon === 'in' ? (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M10 4v12M5 11l5 5 5-5" /></svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M10 16V4M5 9l5-5 5 5" /></svg>
          )}
        </span>
        <div className="rel-head-text">
          <div className="rel-title">{title} <span className="rel-count">{items.length}</span></div>
          <div className="rel-subtitle">{subtitle}</div>
        </div>
        <motion.button className="icon-btn icon-btn-sm" onClick={onAdd} title="Agregar" whileHover={{ rotate: 90 }}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" /></svg>
        </motion.button>
      </header>

      {items.length === 0 ? (
        <div className="rel-empty">{emptyText}</div>
      ) : (
        <ul className="rel-list">
          {items.map(({ other, weight, index }, i) => {
            const meta = TYPE_META[other.type]
            const tier = tierFor(weight)
            const w = Math.min(parseWeight(weight), 100)
            return (
              <motion.li
                key={index}
                className={'rel-item tier-' + tier}
                onClick={() => onSelectOther(other.id)}
                style={{ '--tc': TYPE_COLOR[other.type] } as React.CSSProperties}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.045, duration: 0.45, ease: EASE_OUT }}
                whileHover={{ x: 2 }}
              >
                <div className="rel-item-body">
                  <div className="rel-item-name">{other.name}</div>
                  <div className="rel-item-meta">
                    <span className="rel-item-type">{meta.short}</span>
                    <span className="rel-item-nit">{other.nit || '—'}</span>
                  </div>
                  <div className="rel-item-track">
                    <motion.span
                      className="rel-item-fill"
                      initial={{ width: 0 }}
                      animate={{ width: weight ? `${Math.max(w, 1.5)}%` : '100%' }}
                      transition={{ delay: 0.4 + i * 0.05, duration: 0.9, ease: EASE_OUT }}
                    />
                  </div>
                </div>
                <div className={'rel-item-pct' + (!weight ? ' is-missing' : '')}>
                  {weight ? `${weight}%` : 'sin %'}
                </div>
                <button
                  className="rel-item-edit"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onEditEdge(index)
                  }}
                  title="Editar %"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3.5 16.5l3.5-.8 9-9-2.7-2.7-9 9-.8 3.5zM11.8 5.5l2.7 2.7" strokeLinejoin="round" /></svg>
                </button>
              </motion.li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
