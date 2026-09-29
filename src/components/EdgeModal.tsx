import { useEffect, useMemo, useState } from 'react'
import type { Company, Ownership } from '../data/graph'
import { TYPE_META } from '../data/graph'
import { AnimatePresence, motion } from 'motion/react'
import { Modal, Stagger } from './Modal'
import { TYPE_COLOR } from '../lib/theme'

interface Props {
  open: boolean
  edge: Ownership | null
  companies: Company[]
  defaultFrom?: number
  defaultTo?: number
  onClose: () => void
  onSave: (data: Ownership) => void
  onDelete?: () => void
}

export function EdgeModal({ open, edge, companies, defaultFrom, defaultTo, onClose, onSave, onDelete }: Props) {
  const [from, setFrom] = useState<number | null>(null)
  const [to, setTo] = useState<number | null>(null)
  const [weight, setWeight] = useState('')

  const sorted = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [companies],
  )

  useEffect(() => {
    if (open) {
      setFrom(edge?.from ?? defaultFrom ?? sorted[0]?.id ?? null)
      setTo(edge?.to ?? defaultTo ?? sorted[1]?.id ?? null)
      setWeight(edge?.weight ?? '')
    }
  }, [open, edge, defaultFrom, defaultTo, sorted])

  const canSave = from != null && to != null && from !== to

  const handleSave = () => {
    if (!canSave) return
    onSave({ from: from!, to: to!, weight: weight.trim() || null })
  }

  const fromCompany = from != null ? companies.find((c) => c.id === from) : null
  const toCompany = to != null ? companies.find((c) => c.id === to) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={edge ? 'Editar participación' : 'Nueva participación'}
      subtitle="El dueño posee el porcentaje indicado sobre la participada."
    >
      <Stagger className="edge-preview">
        <EdgePreviewCard company={fromCompany} label="Dueño" />
        <div className="edge-preview-connector">
          <div className="edge-preview-line"><span className="edge-preview-travel" /></div>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={weight || 'none'}
              className={'edge-preview-pct' + (weight ? '' : ' is-empty')}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {weight ? `${weight}%` : 'sin %'}
            </motion.div>
          </AnimatePresence>
          <div className="edge-preview-line"><span className="edge-preview-travel" /></div>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" className="edge-preview-arrow"><path d="M2 8h12M9 3l5 5-5 5" /></svg>
        </div>
        <EdgePreviewCard company={toCompany} label="Participada" />
      </Stagger>

      <Stagger className="form-grid-2">
        <div className="form-field">
          <label htmlFor="fld-from">Dueño</label>
          <select id="fld-from" value={from ?? ''} onChange={(e) => setFrom(Number(e.target.value))}>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="fld-to">Participada</label>
          <select id="fld-to" value={to ?? ''} onChange={(e) => setTo(Number(e.target.value))}>
            {sorted.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </Stagger>

      <Stagger className="form-field">
        <label htmlFor="fld-weight">Porcentaje de participación</label>
        <div className="input-with-suffix">
          <input
            id="fld-weight"
            type="text"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="Ej.: 60,57"
          />
          <span className="input-suffix">%</span>
        </div>
        <p className="form-hint">Acepta coma o punto decimal. Deja vacío si aún no se ha determinado.</p>
      </Stagger>

      {from != null && to != null && from === to && (
        <motion.div className="form-alert" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -6, 6, -3, 3, 0] }} transition={{ duration: 0.45 }}>Un nodo no puede ser dueño de sí mismo.</motion.div>
      )}

      <Stagger className="modal-actions">
        {onDelete && (
          <button className="btn btn-danger" onClick={onDelete}>Eliminar</button>
        )}
        <div className="modal-actions-right">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
            {edge ? 'Guardar cambios' : 'Crear participación'}
          </button>
        </div>
      </Stagger>
    </Modal>
  )
}

function EdgePreviewCard({ company, label }: { company: Company | null | undefined; label: string }) {
  if (!company) {
    return (
      <div className="edge-preview-card is-empty">
        <div className="edge-preview-label">{label}</div>
        <div className="edge-preview-name">Sin selección</div>
      </div>
    )
  }
  const meta = TYPE_META[company.type]
  return (
    <motion.div
      key={company.id}
      className="edge-preview-card"
      style={{ '--card-color': TYPE_COLOR[company.type] } as React.CSSProperties}
      initial={{ opacity: 0.4, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="edge-preview-label">{label}</div>
      <div className="edge-preview-type">{meta.short}</div>
      <div className="edge-preview-name">{company.name}</div>
      {company.nit && <div className="edge-preview-nit">{company.nit}</div>}
    </motion.div>
  )
}
