import { memo } from 'react'
import { motion } from 'motion/react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { TYPE_META, type EntityType } from '../data/graph'
import { TYPE_COLOR, EASE_OUT } from '../lib/theme'

export interface CompanyNodeData {
  label: string
  nit: string
  type: EntityType
  dimmed?: boolean
  focused?: boolean
  inPath?: boolean
  ownersCount: number
  ownedCount: number
  enterDelay?: number
  direction?: 'TB' | 'LR'
  [key: string]: unknown
}

function CompanyNodeImpl({ data, selected }: NodeProps) {
  const d = data as unknown as CompanyNodeData
  const meta = TYPE_META[d.type]
  const color = TYPE_COLOR[d.type]
  const horizontal = d.direction === 'LR'

  return (
    <motion.div
      className={
        'node' +
        (selected ? ' is-selected' : '') +
        (d.focused ? ' is-focused' : '') +
        (d.inPath ? ' is-path' : '') +
        (d.dimmed ? ' is-dimmed' : '')
      }
      style={{ '--tc': color } as React.CSSProperties}
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      animate={{
        opacity: d.dimmed ? 0.28 : 1,
        y: 0,
        scale: d.dimmed ? 0.97 : 1,
        filter: d.dimmed ? 'saturate(0)' : 'saturate(1)',
      }}
      transition={{
        opacity: { duration: 0.45, delay: d.enterDelay ?? 0, ease: EASE_OUT },
        y: { duration: 0.7, delay: d.enterDelay ?? 0, ease: EASE_OUT },
        scale: { duration: 0.5, delay: d.enterDelay ?? 0, ease: EASE_OUT },
        filter: { duration: 0.4 },
      }}
      whileHover={d.dimmed ? undefined : { y: -3 }}
    >
      <Handle type="target" position={horizontal ? Position.Left : Position.Top} className="node-handle" />

      <span className="node-rail" aria-hidden="true" />

      <div className="node-top">
        <span className="node-type">{meta.short}</span>
        {(d.ownersCount > 0 || d.ownedCount > 0) && (
          <span className="node-deg" title={`${d.ownersCount} dueño(s) · ${d.ownedCount} participada(s)`}>
            <span className="node-deg-in">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v8M3 7l3 3 3-3" /></svg>
              {d.ownersCount}
            </span>
            <span className="node-deg-out">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 10V2M3 5l3-3 3 3" /></svg>
              {d.ownedCount}
            </span>
          </span>
        )}
      </div>

      <div className="node-name" title={d.label}>{d.label}</div>
      <div className="node-nit">{d.nit || '—'}</div>

      {selected && <span className="node-pulse" aria-hidden="true" />}

      <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} className="node-handle" />
    </motion.div>
  )
}

export const CompanyNode = memo(CompanyNodeImpl)
