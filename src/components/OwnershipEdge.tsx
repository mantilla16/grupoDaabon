import { memo } from 'react'
import { motion } from 'motion/react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { TIER_STYLE, type Tier, EASE_OUT } from '../lib/theme'

export interface OwnershipEdgeData {
  tier: Tier
  weight: string | null
  dim: boolean
  focused: boolean
  delay: number
  intro: boolean
  index: number
  laneOffset?: number
  onOpen: (index: number) => void
  [key: string]: unknown
}

function OwnershipEdgeImpl(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected } = props
  const d = props.data as unknown as OwnershipEdgeData
  const lane = d.laneOffset ?? 0
  // Shift the horizontal elbow away from the "trunk" so siblings each get their
  // own lane. The offset param on getSmoothStepPath is the distance the path
  // travels perpendicular before the first turn — varying it per edge separates
  // otherwise-overlapping routes.
  const offset = 40 + Math.abs(lane) * 0.5
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: sourceX + (sourcePosition === 'top' || sourcePosition === 'bottom' ? lane : 0),
    sourceY: sourceY + (sourcePosition === 'left' || sourcePosition === 'right' ? lane : 0),
    targetX: targetX + (targetPosition === 'top' || targetPosition === 'bottom' ? lane : 0),
    targetY: targetY + (targetPosition === 'left' || targetPosition === 'right' ? lane : 0),
    sourcePosition,
    targetPosition,
    borderRadius: 12,
    offset,
  })
  const s = TIER_STYLE[d.tier]

  // Focus preserves tier color (so control vs minor stays legible); only bumps weight.
  // Dim state fades hard so the highlighted path reads as the single thing on the canvas.
  const stroke = d.dim ? '#DEDCD5' : s.stroke
  const width = d.focused ? s.width * 1.35 : d.dim ? Math.max(0.9, s.width * 0.75) : s.width
  const dashArray = d.tier === 'missing' && !d.dim ? '6 5' : undefined

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={22}
        className={
          'own-edge tier-' + d.tier +
          (d.dim ? ' is-dim' : '') +
          (d.focused ? ' is-focused' : '') +
          (d.intro ? ' is-intro' : '') +
          (selected ? ' is-selected' : '')
        }
        style={{
          stroke,
          strokeWidth: width,
          strokeDasharray: dashArray,
          strokeOpacity: d.dim ? 0.35 : 1,
          animationDelay: `${d.delay + 0.75}s`,
        }}
      />

      {d.intro && (
        <motion.path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
          className="edge-draw"
          initial={{ pathLength: 0, opacity: 1 }}
          animate={{ pathLength: 1, opacity: 0 }}
          transition={{
            pathLength: { duration: 0.9, delay: d.delay, ease: EASE_OUT },
            opacity: { duration: 0.2, delay: d.delay + 0.9 },
          }}
        />
      )}

      {!d.dim && (
        <EdgeLabelRenderer>
          <div
            className="edge-pill-anchor nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: d.focused ? 3 : 1,
            }}
          >
            <motion.button
              type="button"
              className={
                'edge-pill tier-' + d.tier +
                (d.focused ? ' is-focused' : '')
              }
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: d.intro ? d.delay + 0.6 : 0, duration: 0.35, ease: EASE_OUT }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={(e) => { e.stopPropagation(); d.onOpen(d.index) }}
              title="Editar participación"
            >
              {d.weight ? `${d.weight}%` : 'sin %'}
            </motion.button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const OwnershipEdge = memo(OwnershipEdgeImpl)
