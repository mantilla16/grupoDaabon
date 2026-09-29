import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { Company, EntityType, GraphData } from '../data/graph'
import { TYPE_META } from '../data/graph'
import { TYPE_COLOR, EASE_OUT, SPRING } from '../lib/theme'

interface Props {
  data: GraphData
  selectedId: number | null
  onSelect: (id: number) => void
  onAddCompany: () => void
  onFocus: (id: number) => void
  focusedId: number | null
  onClearFocus: () => void
}

const TYPES: EntityType[] = ['SAS', 'SCA', 'SA', 'PN', 'Otro']

export function LeftPanel({ data, selectedId, onSelect, onAddCompany, onFocus, focusedId, onClearFocus }: Props) {
  const [query, setQuery] = useState('')
  const [filterType, setFilterType] = useState<EntityType | 'ALL'>('ALL')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counts = useMemo(() => {
    const c: Record<EntityType, number> = { SAS: 0, SCA: 0, SA: 0, PN: 0, Otro: 0 }
    for (const n of data.nodes) c[n.type]++
    return c
  }, [data.nodes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.nodes
      .filter((n) => (filterType === 'ALL' ? true : n.type === filterType))
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.nit.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [data.nodes, query, filterType])

  const focused = focusedId != null ? data.nodes.find((n) => n.id === focusedId) : null
  const total = data.nodes.length || 1

  return (
    <aside className="left-panel">
      <div className="lp-section">
        <label className="search">
          <svg className="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="9" r="5.8" /><path d="m16.5 16.5-3.3-3.3" strokeLinecap="round" /></svg>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Buscar por nombre o NIT"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <AnimatePresence>
            {query ? (
              <motion.button
                key="clear"
                className="search-clear"
                onClick={() => setQuery('')}
                aria-label="Limpiar"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                transition={SPRING}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l8 8M14 6l-8 8" /></svg>
              </motion.button>
            ) : (
              <motion.kbd key="kbd" className="search-kbd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>/</motion.kbd>
            )}
          </AnimatePresence>
        </label>
      </div>

      <AnimatePresence initial={false}>
        {focused && (
          <motion.div
            key="focus"
            className="focus-callout"
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 12 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <div className="focus-callout-inner">
              <div className="focus-callout-head">
                <span className="live-dot" />
                <span>Vista enfocada</span>
                <button className="link-btn" onClick={onClearFocus}>Limpiar</button>
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={focused.id}
                  className="focus-name"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22 }}
                >
                  {focused.name}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lp-section">
        <div className="lp-heading">
          <h3>Tipo de entidad</h3>
        </div>

        <div className="type-bar" aria-hidden="true">
          {TYPES.map((t, i) => (
            <motion.span
              key={t}
              className="type-bar-seg"
              style={{ background: TYPE_COLOR[t] }}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: counts[t] / total, opacity: filterType === 'ALL' || filterType === t ? 1 : 0.22 }}
              transition={{ flexGrow: { delay: 0.4 + i * 0.07, duration: 0.9, ease: EASE_OUT }, opacity: { duration: 0.25 } }}
            />
          ))}
        </div>

        <div className="type-filter">
          <TypePill
            active={filterType === 'ALL'}
            label="Todas"
            count={data.nodes.length}
            color="var(--ink)"
            onClick={() => setFilterType('ALL')}
          />
          {TYPES.map((t) => (
            <TypePill
              key={t}
              active={filterType === t}
              label={t}
              tooltip={TYPE_META[t].label}
              count={counts[t]}
              color={TYPE_COLOR[t]}
              onClick={() => setFilterType((cur) => (cur === t ? 'ALL' : t))}
            />
          ))}
        </div>
      </div>

      <div className="lp-section lp-grow">
        <div className="lp-heading">
          <h3>
            Compañías
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={filtered.length}
                className="lp-count"
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {filtered.length}
              </motion.span>
            </AnimatePresence>
          </h3>
          <motion.button className="icon-btn icon-btn-sm" onClick={onAddCompany} title="Agregar compañía" whileHover={{ rotate: 90 }} transition={SPRING}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" /></svg>
          </motion.button>
        </div>

        <ul className="company-list">
          <AnimatePresence initial={true} mode="popLayout">
            {filtered.map((n, i) => (
              <CompanyRow
                key={n.id}
                index={i}
                node={n}
                selected={n.id === selectedId}
                focused={n.id === focusedId}
                onSelect={() => onSelect(n.id)}
                onFocus={() => onFocus(n.id)}
              />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <motion.li className="company-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              Nada coincide con este filtro.
            </motion.li>
          )}
        </ul>
      </div>
    </aside>
  )
}

interface TypePillProps {
  active: boolean
  label: string
  tooltip?: string
  count: number
  color: string
  onClick: () => void
}
function TypePill({ active, label, tooltip, count, color, onClick }: TypePillProps) {
  return (
    <motion.button
      className={'type-pill' + (active ? ' is-active' : '')}
      onClick={onClick}
      title={tooltip}
      style={{ '--pc': color } as React.CSSProperties}
      whileTap={{ scale: 0.94 }}
    >
      {active && <motion.span layoutId="type-pill-bg" className="type-pill-bg" transition={SPRING} />}
      <span className="type-pill-dot" />
      <span className="type-pill-label">{label}</span>
      <span className="type-pill-count">{count}</span>
    </motion.button>
  )
}

interface CompanyRowProps {
  index: number
  node: Company
  selected: boolean
  focused: boolean
  onSelect: () => void
  onFocus: () => void
}
function CompanyRow({ index, node, selected, focused, onSelect, onFocus }: CompanyRowProps) {
  const meta = TYPE_META[node.type]
  return (
    <motion.li
      layout="position"
      className={'company-row' + (selected ? ' is-selected' : '') + (focused ? ' is-focused' : '')}
      onClick={onSelect}
      style={{ '--tc': TYPE_COLOR[node.type] } as React.CSSProperties}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
      transition={{ duration: 0.4, delay: Math.min(index, 18) * 0.022, ease: EASE_OUT, layout: { duration: 0.3, ease: EASE_OUT } }}
    >
      {selected && <motion.span layoutId="company-row-sel" className="company-row-sel" transition={SPRING} />}
      <span className="company-row-mark" />
      <div className="company-row-body">
        <div className="company-row-name">{node.name}</div>
        <div className="company-row-meta">
          <span className="company-row-type">{meta.short}</span>
          <span className="company-row-nit">{node.nit || '—'}</span>
        </div>
      </div>
      <button
        className="company-row-focus"
        onClick={(e) => {
          e.stopPropagation()
          onFocus()
        }}
        title="Enfocar en el mapa"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="3.2" /><path d="M10 2.5v2.5M10 15v2.5M2.5 10H5M15 10h2.5" strokeLinecap="round" /></svg>
      </button>
    </motion.li>
  )
}
