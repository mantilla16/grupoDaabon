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
  rank?: number
  [key: string]: unknown
}

/**
 * Nodo compañía (§3 del handoff).
 * - 224×96, padding 10 12 10 15, radio 10, rail 3px que crece a 4px full-height
 *   en hover / selección / foco.
 * - Fila superior con chip de tipo + grados (↓dueños ↑participadas).
 * - Nombre 13.5/550, max 2 líneas.
 * - NIT mono 10.5.
 *
 * El zoom semántico (LOD) se maneja 100 % en CSS mediante las variables
 * `--lod`, `--detail`, `--nameMargin` que App.tsx setea en el viewport.
 */
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
      style={{
        '--tc': color,
        opacity: d.dimmed ? 0.3 : 1,
      } as React.CSSProperties}
      // §7 — Coreografía de entrada
      initial={{ opacity: 0, y: 18, scale: 0.94 }}
      animate={{
        opacity: d.dimmed ? 0.3 : 1,
        y: 0,
        scale: 1,
      }}
      transition={{
        opacity: { duration: 0.75, delay: d.enterDelay ?? 0, ease: EASE_OUT },
        y: { duration: 0.75, delay: d.enterDelay ?? 0, ease: EASE_OUT },
        scale: { duration: 0.75, delay: d.enterDelay ?? 0, ease: EASE_OUT },
      }}
      whileHover={d.dimmed ? undefined : { y: -3 }}
      data-card=""
      data-rank={d.rank ?? 0}
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        className="node-handle"
      />

      <span className="node-rail" aria-hidden="true" />

      <div className="node-top">
        <span className="node-type">{meta.short}</span>
        {(d.ownersCount > 0 || d.ownedCount > 0) && (
          <span
            className="node-deg"
            title={`${d.ownersCount} dueño(s) · ${d.ownedCount} participada(s)`}
          >
            <span className="node-deg-in">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 2v8M3 7l3 3 3-3" />
              </svg>
              {d.ownersCount}
            </span>
            <span className="node-deg-out">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 10V2M3 5l3-3 3 3" />
              </svg>
              {d.ownedCount}
            </span>
          </span>
        )}
      </div>

      <div className="node-name" title={d.label}>{d.label}</div>
      <div className="node-nit">{d.nit || '—'}</div>

      {selected && <span className="node-pulse" aria-hidden="true" />}

      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        className="node-handle"
      />
    </motion.div>
  )
}

export const CompanyNode = memo(CompanyNodeImpl)
