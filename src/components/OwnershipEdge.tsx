import { memo } from 'react'
import { motion } from 'motion/react'
import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'
import { TIER_STYLE, type Tier } from '../lib/theme'
import { NODE_WIDTH, NODE_HEIGHT, type EdgeGeometry } from '../lib/layout'

export interface OwnershipEdgeData {
  tier: Tier
  weight: string | null
  dim: boolean
  focused: boolean
  emphasized?: boolean
  delay: number
  intro: boolean
  index: number
  direction: 'TB' | 'LR'
  geometry?: EdgeGeometry
  sourcePos?: { x: number; y: number }
  targetPos?: { x: number; y: number }
  onOpen: (index: number) => void
  [key: string]: unknown
}

/**
 * Enrutado ortogonal portado del prototipo (§2 del handoff).
 * - Los `points` vienen de dagre (en el layout §1) ya con las labels reservadas.
 * - Ajustamos primero/último punto a los puertos del borde de la tarjeta,
 *   limitando el x/y para que no salga por la esquina.
 * - `ortho()` construye un path 100 % ortogonal con esquinas Q de radio 8.
 * - La flecha es un triángulo SVG propio, no un markerEnd (así se anima aparte).
 */

const r1 = (n: number) => Math.round(n * 10) / 10
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function ortho(pts: { x: number; y: number }[], tb: boolean, lane: number): string {
  if (pts.length < 2) return ''
  const A = (p: { x: number; y: number }) => (tb ? p.y : p.x)
  const C = (p: { x: number; y: number }) => (tb ? p.x : p.y)
  const mk = (a: number, c: number) => (tb ? { x: c, y: a } : { x: a, y: c })

  const out: { x: number; y: number }[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const p = out[out.length - 1]
    const q = pts[i + 1]
    if (Math.abs(C(p) - C(q)) < 1.5) {
      out.push(mk(A(q), C(p)))
      continue
    }
    const m = (A(p) + A(q)) / 2 + lane
    out.push(mk(m, C(p)), mk(m, C(q)), q)
  }

  // Quitar duplicados y puntos colineales
  const P: { x: number; y: number }[] = [out[0]]
  for (let i = 1; i < out.length; i++) {
    const a = P[P.length - 1]
    const b = out[i]
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) continue
    if (P.length >= 2) {
      const z = P[P.length - 2]
      if (
        (Math.abs(z.x - a.x) < 0.5 && Math.abs(a.x - b.x) < 0.5) ||
        (Math.abs(z.y - a.y) < 0.5 && Math.abs(a.y - b.y) < 0.5)
      ) {
        P[P.length - 1] = b
        continue
      }
    }
    P.push(b)
  }

  if (P.length < 2) return ''
  let d = `M${r1(P[0].x)},${r1(P[0].y)}`
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1]
    const b = P[i]
    const c = P[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.y - a.y)
    const l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const r = Math.min(8, l1 / 2, l2 / 2)
    if (l1 <= 0 || l2 <= 0) {
      d += ` L${r1(b.x)},${r1(b.y)}`
      continue
    }
    const p1 = { x: b.x - ((b.x - a.x) / l1) * r, y: b.y - ((b.y - a.y) / l1) * r }
    const p2 = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r }
    d += ` L${r1(p1.x)},${r1(p1.y)} Q${r1(b.x)},${r1(b.y)} ${r1(p2.x)},${r1(p2.y)}`
  }
  const L = P[P.length - 1]
  return `${d} L${r1(L.x)},${r1(L.y)}`
}

function edgeGeom(
  geo: EdgeGeometry,
  s: { x: number; y: number },
  t: { x: number; y: number },
  dir: 'TB' | 'LR',
  idx: number,
): { d: string; arrow: string; lx: number; ly: number } {
  const P = geo.points.slice(1, -1)
  const first = P[0] || geo.points[geo.points.length - 1] || { x: s.x + NODE_WIDTH / 2, y: s.y + NODE_HEIGHT / 2 }
  const last = P[P.length - 1] || geo.points[0] || { x: t.x + NODE_WIDTH / 2, y: t.y + NODE_HEIGHT / 2 }

  let pts: { x: number; y: number }[]
  let arrow: string
  if (dir === 'TB') {
    const sp = { x: clamp(first.x, s.x + 18, s.x + NODE_WIDTH - 18), y: s.y + NODE_HEIGHT }
    const tp = { x: clamp(last.x, t.x + 18, t.x + NODE_WIDTH - 18), y: t.y }
    pts = [sp, ...P, { x: tp.x, y: tp.y - 8 }]
    arrow = `M${r1(tp.x - 5)},${r1(tp.y - 9)} L${r1(tp.x + 5)},${r1(tp.y - 9)} L${r1(tp.x)},${r1(tp.y)} Z`
  } else {
    const sp = { x: s.x + NODE_WIDTH, y: clamp(first.y, s.y + 14, s.y + NODE_HEIGHT - 14) }
    const tp = { x: t.x, y: clamp(last.y, t.y + 14, t.y + NODE_HEIGHT - 14) }
    pts = [sp, ...P, { x: tp.x - 8, y: tp.y }]
    arrow = `M${r1(tp.x - 9)},${r1(tp.y - 5)} L${r1(tp.x - 9)},${r1(tp.y + 5)} L${r1(tp.x)},${r1(tp.y)} Z`
  }
  return {
    d: ortho(pts, dir === 'TB', ((idx % 5) - 2) * 4),
    arrow,
    lx: r1(geo.labelX),
    ly: r1(geo.labelY),
  }
}

function OwnershipEdgeImpl(props: EdgeProps) {
  const { id } = props
  const d = props.data as unknown as OwnershipEdgeData

  // Sin geometría del layout no podemos dibujar (edge nueva o antes de que
  // corra el layout inicial). Devolvemos null limpio.
  if (!d.geometry || !d.sourcePos || !d.targetPos) return null

  const g = edgeGeom(d.geometry, d.sourcePos, d.targetPos, d.direction, d.index)
  const tier = TIER_STYLE[d.tier]
  const isDashed = d.tier === 'missing'
  const emph = d.emphasized || d.focused

  // Ancho base × multiplicador de énfasis (§2.3). El multiplicador --lod se
  // aplica en CSS para compensar el zoom.
  const baseWidth = tier.width * (emph ? 1.45 : 1)
  const stroke = d.dim ? '#DEDCD5' : tier.stroke
  const strokeOpacity = d.dim ? 0.28 : 1

  return (
    <>
      {/* Path invisible ancho para hit-testing (facilita el hover) */}
      <path
        d={g.d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        data-edge-hit={d.index}
      />

      {/* Trazo visible */}
      <path
        id={`edge-${id}`}
        d={g.d}
        fill="none"
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={isDashed ? '6 5' : undefined}
        className={
          'own-edge tier-' + d.tier +
          (d.dim ? ' is-dim' : '') +
          (emph ? ' is-emph' : '') +
          (d.intro ? ' is-intro' : '')
        }
        style={{
          strokeWidth: `calc(${baseWidth}px * var(--lod, 1))`,
          transition: 'stroke 0.3s var(--ease-out), stroke-opacity 0.3s',
        }}
        data-edge-index={d.index}
        data-rank={d.delay}
      />

      {/* Flujo animado sobre aristas resaltadas (§6) — punto que corre */}
      {emph && !d.dim && (
        <path
          d={g.d}
          fill="none"
          stroke={tier.stroke}
          strokeOpacity={0.9}
          strokeDasharray=".1 13.9"
          strokeLinecap="round"
          className="own-edge-flow"
          style={{
            strokeWidth: `calc(3.6px * var(--lod, 1))`,
          }}
        />
      )}

      {/* Punta de flecha propia (triángulo, no markerEnd) */}
      <path
        d={g.arrow}
        fill={stroke}
        fillOpacity={strokeOpacity}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth={0.5}
        className={'own-edge-arrow tier-' + d.tier}
      />

      {/* Pill del % en (labelX, labelY) de dagre — SIEMPRE cae en un tramo
          vertical del path, no se encima con otras aristas. */}
      {!d.dim && (
        <EdgeLabelRenderer>
          <div
            className="edge-pill-anchor nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${g.lx}px, ${g.ly}px) scale(var(--plod, 1))`,
              zIndex: emph ? 5 : 2,
            }}
          >
            <motion.button
              type="button"
              className={
                'edge-pill tier-' + d.tier +
                (emph ? ' is-emph' : '') +
                (d.tier === 'minor' ? ' is-minor' : '')
              }
              initial={d.intro ? { opacity: 0, scale: 0.55 } : false}
              animate={d.intro ? { opacity: 1, scale: 1 } : undefined}
              transition={{
                delay: d.intro ? d.delay + 0.38 : 0,
                duration: 0.48,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
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
