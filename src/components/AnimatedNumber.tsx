import { useEffect, useRef } from 'react'
import { animate, useInView } from 'motion/react'

interface Props {
  value: number
  decimals?: number
  delay?: number
  duration?: number
  pad?: number
  className?: string
}

/** Rolls a number to its new value (tabular, es-CO formatting). */
export function AnimatedNumber({ value, decimals = 0, delay = 0, duration = 0.9, pad = 0, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    const fmt = (n: number) => {
      const s = n.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      return pad ? s.padStart(pad, '0') : s
    }
    const controls = animate(prev.current, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = fmt(v) },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, decimals, delay, duration, pad, inView])

  return <span ref={ref} className={className}>{pad ? '0'.repeat(pad) : '0'}</span>
}
