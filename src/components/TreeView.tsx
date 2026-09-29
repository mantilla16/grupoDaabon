import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { TYPE_COLOR, EASE_OUT, SPRING } from '../lib/theme'
import { AnimatedNumber } from './AnimatedNumber'
import type { Company, GraphData } from '../data/graph'
import { TYPE_META } from '../data/graph'

interface Props {
  data: GraphData
  selectedId: number | null
  onSelect: (id: number) => void
  onFocus: (id: number) => void
}

type Mode = 'roots' | 'all' | 'orphans'

function parseWeight(w: string | null): number {
  if (!w) return 0
  return parseFloat(w.replace(',', '.')) || 0
}
function formatPct(n: number): string {
  return n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
}
function weightTier(w: string | null): 'ctrl' | 'sig' | 'minor' | 'missing' {
  if (!w) return 'missing'
  const n = parseWeight(w)
  if (n >= 50) return 'ctrl'
  if (n >= 5) return 'sig'
  return 'minor'
}

export function TreeView({ data, selectedId, onSelect, onFocus }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<Mode>('roots')
  const [query, setQuery] = useState('')

  const nodeById = useMemo(() => {
    const m = new Map<number, Company>()
    data.nodes.forEach((n) => m.set(n.id, n))
    return m
  }, [data.nodes])

  const outgoing = useMemo(() => {
    const m = new Map<number, { toId: number; weight: string | null }[]>()
    data.nodes.forEach((n) => m.set(n.id, []))
    data.edges.forEach((e) => {
      const list = m.get(e.from) ?? []
      list.push({ toId: e.to, weight: e.weight })
      m.set(e.from, list)
    })
    m.forEach((list) => {
      list.sort((a, b) => {
        if (!a.weight && b.weight) return 1
        if (a.weight && !b.weight) return -1
        return parseWeight(b.weight) - parseWeight(a.weight)
      })
    })
    return m
  }, [data.edges, data.nodes])

  const incoming = useMemo(() => {
    const m = new Map<number, { fromId: number; weight: string | null }[]>()
    data.nodes.forEach((n) => m.set(n.id, []))
    data.edges.forEach((e) => {
      const list = m.get(e.to) ?? []
      list.push({ fromId: e.from, weight: e.weight })
      m.set(e.to, list)
    })
    return m
  }, [data.edges, data.nodes])

  const roots = useMemo(
    () => data.nodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0),
    [data.nodes, incoming],
  )
  const orphans = useMemo(
    () =>
      data.nodes.filter(
        (n) => (incoming.get(n.id)?.length ?? 0) === 0 && (outgoing.get(n.id)?.length ?? 0) === 0,
      ),
    [data.nodes, incoming, outgoing],
  )

  const listSource: Company[] = mode === 'roots' ? roots : mode === 'orphans' ? orphans : data.nodes

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listSource
      .filter((n) => !q || n.name.toLowerCase().includes(q) || n.nit.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }, [listSource, query])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const expandAll = () => setExpanded(new Set(filtered.map((n) => keyFor([n.id]))))
  const collapseAll = () => setExpanded(new Set())

  return (
    <div className="tree">
      <div className="tree-head">
        <div className="tree-head-inner">
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            className="tree-head-title"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            <div className="tree-head-eyebrow">Índice · <span>Cédula sumaria de composición accionaria</span></div>
            <h2 className="tree-head-name">
              {mode === 'roots' && <>Compañías de <em>cabecera</em></>}
              {mode === 'all' && <>Todas las <em>entidades</em> del papel</>}
              {mode === 'orphans' && <>Entidades <em>aisladas</em></>}
            </h2>
            <p className="tree-head-lede">
              {mode === 'roots' && 'Sociedades sin dueños identificados en el papel; punto de entrada del árbol de propiedad.'}
              {mode === 'all' && 'Todas las entidades registradas en el papel, en orden alfabético.'}
              {mode === 'orphans' && 'Entidades sin dueños ni participadas registradas. Revisar si su vinculación quedó pendiente.'}
            </p>
          </motion.div>
          </AnimatePresence>
          <div className="tree-head-meta">
            <div className="tree-head-meta-row">
              <span className="tree-head-meta-num"><AnimatedNumber value={filtered.length} pad={2} delay={0.2} /></span>
              <span className="tree-head-meta-label">Compañías listadas</span>
            </div>
            <div className="tree-head-meta-row">
              <span className="tree-head-meta-num"><AnimatedNumber value={data.edges.length} pad={2} delay={0.3} /></span>
              <span className="tree-head-meta-label">Relaciones totales</span>
            </div>
          </div>
        </div>

        <div className="tree-controls">
          <div className="tree-tabs" role="tablist">
            <TreeTab active={mode === 'roots'} onClick={() => setMode('roots')} label="Cabeceras" count={roots.length} />
            <TreeTab active={mode === 'all'} onClick={() => setMode('all')} label="Todas" count={data.nodes.length} />
            <TreeTab active={mode === 'orphans'} onClick={() => setMode('orphans')} label="Aisladas" count={orphans.length} />
          </div>
          <div className="tree-actions">
            <div className="tree-search">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="5.5" /><path d="m16.5 16.5-3-3" strokeLinecap="round" /></svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nombre o NIT"
                aria-label="Filtrar"
              />
              {query && <button className="tree-search-clear" onClick={() => setQuery('')} aria-label="Limpiar"><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" /></svg></button>}
            </div>
            <button className="tree-quiet" onClick={expandAll} title="Expandir todas">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3v8M3 7l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Expandir
            </button>
            <button className="tree-quiet" onClick={collapseAll} title="Colapsar todas">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 11V3M3 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Colapsar
            </button>
          </div>
        </div>

        <div className="tree-columns" aria-hidden="true">
          <span>#</span>
          <span>Compañía</span>
          <span>Tipo</span>
          <span className="align-right">NIT / Identificación</span>
          <span className="align-right">Participación</span>
        </div>
      </div>

      <div className="tree-scroll">
        {filtered.length === 0 ? (
          <div className="tree-void">
            <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1"><path d="M8 12h24M8 20h24M8 28h16" strokeLinecap="round" /></svg>
            <p>Ninguna compañía coincide con este filtro.</p>
          </div>
        ) : (
          <ol className="tree-list" key={mode}>
            {filtered.map((node, i) => (
              <motion.li
                className="tree-wrap"
                key={node.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: Math.min(i, 20) * 0.03, ease: EASE_OUT }}
              >
              <TreeItem
                key={node.id}
                index={i + 1}
                node={node}
                weightIn={null}
                path={[node.id]}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                nodeById={nodeById}
                outgoing={outgoing}
                incoming={incoming}
                onSelect={onSelect}
                onFocus={onFocus}
                selectedId={selectedId}
                isLast
              />
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function TreeTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button role="tab" aria-selected={active} className={'tree-tab' + (active ? ' is-active' : '')} onClick={onClick}>
      <span className="tree-tab-label">{label}</span>
      <span className="tree-tab-count">{count}</span>
      {active && <motion.span layoutId="tree-tab-marker" className="tree-tab-marker" aria-hidden="true" transition={SPRING} />}
    </button>
  )
}

function keyFor(path: number[]): string {
  return path.join('>')
}

interface TreeItemProps {
  index: number
  node: Company
  weightIn: string | null
  path: number[]
  depth: number
  expanded: Set<string>
  onToggle: (key: string) => void
  nodeById: Map<number, Company>
  outgoing: Map<number, { toId: number; weight: string | null }[]>
  incoming: Map<number, { fromId: number; weight: string | null }[]>
  onSelect: (id: number) => void
  onFocus: (id: number) => void
  selectedId: number | null
  isLast: boolean
}

function TreeItem({
  index,
  node,
  weightIn,
  path,
  depth,
  expanded,
  onToggle,
  nodeById,
  outgoing,
  incoming,
  onSelect,
  onFocus,
  selectedId,
  isLast,
}: TreeItemProps) {
  const key = keyFor(path)
  const isOpen = expanded.has(key)
  const meta = TYPE_META[node.type]
  const out = outgoing.get(node.id) ?? []
  const inn = incoming.get(node.id) ?? []
  const isSelected = selectedId === node.id
  const isCycle = path.slice(0, -1).includes(node.id)
  const canExpand = out.length > 0 && !isCycle

  const outConfirmed = out.filter((o) => o.weight)
  const outMissing = out.length - outConfirmed.length
  const totalOwnedPct = out.reduce((a, o) => a + parseWeight(o.weight), 0)
  const topOut = outConfirmed[0]
  const topOutNode = topOut ? nodeById.get(topOut.toId) : null
  const tierIn = weightIn != null ? weightTier(weightIn) : null


  return (
    <div
      className={
        'tree-node' +
        (isSelected ? ' is-selected' : '') +
        (depth > 0 ? ' is-child' : '') +
        (isLast ? ' is-last' : '')
      }
      data-depth={depth}
    >
      <div
        className={'tree-line' + (canExpand ? ' can-expand' : '')}
        onClick={() => {
          onSelect(node.id)
          if (canExpand) onToggle(key)
        }}
      >
        {depth > 0 && (
          <div className="tree-guides" aria-hidden="true">
            {Array.from({ length: depth }).map((_, i) => (
              <span key={i} className={'tree-guide' + (i === depth - 1 ? (isLast ? ' is-last' : ' is-mid') : '')} />
            ))}
          </div>
        )}

        <span className="tree-index" aria-hidden="true">
          {depth === 0 ? String(index).padStart(2, '0') : ''}
        </span>

        <span className="tree-chev">
          {canExpand ? (
            <motion.svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" animate={{ rotate: isOpen ? 90 : 0 }} transition={SPRING}>
              <path d="M3.5 2.5l3 2.5-3 2.5" strokeLinecap="round" strokeLinejoin="round" />
            </motion.svg>
          ) : (
            <span className="tree-chev-dot" />
          )}
        </span>

        <div className="tree-main">
          <div className="tree-title-row">
            {tierIn && (
              <span className={'tree-pct-in tier-' + tierIn} title={weightIn ? `${weightIn}% de participación` : 'Sin porcentaje registrado'}>
                {weightIn ? `${weightIn}%` : 'sin %'}
              </span>
            )}
            <h4 className="tree-name">{node.name}</h4>
          </div>

          <div className="tree-sub">
            {inn.length > 0 && (
              <span className="tree-stat">
                <em>{inn.length}</em> dueño{inn.length !== 1 ? 's' : ''}
              </span>
            )}
            {out.length > 0 && (
              <span className="tree-stat">
                <em>{out.length}</em> participada{out.length !== 1 ? 's' : ''}
                {' · Σ '}
                <span className="tree-stat-num">{formatPct(totalOwnedPct)}%</span>
              </span>
            )}
            {outMissing > 0 && (
              <span className="tree-flag" title="Relaciones sin porcentaje declarado">
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v4M6 9v.01" strokeLinecap="round" /></svg>
                {outMissing} sin %
              </span>
            )}
            {topOutNode && depth === 0 && (
              <span className="tree-teaser">
                p. ej. <strong>{topOut.weight}%</strong> en {topOutNode.name}
              </span>
            )}
            {out.length === 0 && inn.length === 0 && (
              <span className="tree-teaser tree-teaser-mute">Sin relaciones registradas.</span>
            )}
          </div>
        </div>

        <span className="tree-type" title={meta.label}>
          <span className="tree-type-mark" style={{ background: TYPE_COLOR[node.type] }} />
          {meta.short}
        </span>

        <span className="tree-nit">{node.nit || <span className="tree-nit-empty">—</span>}</span>

        <div className="tree-tail">
          <button
            className="tree-icon-btn"
            onClick={(e) => {
              e.stopPropagation()
              onFocus(node.id)
            }}
            title="Enfocar en el grafo"
            aria-label="Enfocar en el grafo"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <Collapsible open={isOpen && canExpand}>
        <ol className="tree-children">
          {out.map((edge, i) => {
            const child = nodeById.get(edge.toId)
            if (!child) return null
            return (
              <motion.li
                className="tree-wrap"
                key={`${edge.toId}-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: 0.05 + i * 0.035, ease: EASE_OUT }}
              >
              <TreeItem
                key={`${edge.toId}-${i}`}
                index={i + 1}
                node={child}
                weightIn={edge.weight}
                path={[...path, edge.toId]}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                nodeById={nodeById}
                outgoing={outgoing}
                incoming={incoming}
                onSelect={onSelect}
                onFocus={onFocus}
                selectedId={selectedId}
                isLast={i === out.length - 1}
              />
              </motion.li>
            )
          })}
        </ol>
      </Collapsible>

      {isOpen && isCycle && (
        <motion.div className="tree-cycle" role="note" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 2a5 5 0 1 1-3.5 8.5M2 6V2h4" strokeLinecap="round" /></svg>
          Ciclo detectado — <strong>{node.name}</strong> ya aparece más arriba en esta rama.
        </motion.div>
      )}
    </div>
  )
}

// Collapsible with spring height animation
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          className="collapsible"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ height: { duration: 0.42, ease: EASE_OUT }, opacity: { duration: 0.25 } }}
          style={{ overflow: 'hidden' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
