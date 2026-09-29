import { useEffect, useState } from 'react'
import type { Company, EntityType } from '../data/graph'
import { TYPE_META } from '../data/graph'
import { motion } from 'motion/react'
import { Modal, Stagger } from './Modal'
import { TYPE_COLOR, SPRING } from '../lib/theme'

interface Props {
  open: boolean
  company: Company | null
  onClose: () => void
  onSave: (data: { name: string; nit: string; type: EntityType }) => void
  onDelete?: () => void
}

export function CompanyModal({ open, company, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [nit, setNit] = useState('')
  const [type, setType] = useState<EntityType>('SAS')

  useEffect(() => {
    if (open) {
      setName(company?.name ?? '')
      setNit(company?.nit ?? '')
      setType(company?.type ?? 'SAS')
    }
  }, [open, company])

  const handleSave = () => {
    if (!name.trim()) return
    onSave({ name: name.trim(), nit: nit.trim(), type })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={company ? 'Editar compañía' : 'Nueva compañía'}
      subtitle="Datos básicos de la sociedad para el papel de trabajo."
    >
      <Stagger className="form-field">
        <label htmlFor="fld-name">Razón social</label>
        <input
          id="fld-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej.: Inversiones ABC SAS"
          autoFocus
        />
      </Stagger>

      <Stagger className="form-field">
        <label htmlFor="fld-nit">NIT / Identificación</label>
        <input
          id="fld-nit"
          type="text"
          value={nit}
          onChange={(e) => setNit(e.target.value)}
          placeholder="Ej.: 900.123.456-7"
        />
        <p className="form-hint">Acepta NIT, RUC, DV o "Persona Natural" para individuos.</p>
      </Stagger>

      <Stagger className="form-field">
        <label>Tipo de entidad</label>
        <div className="type-grid">
          {(Object.keys(TYPE_META) as EntityType[]).map((t) => {
            const meta = TYPE_META[t]
            return (
              <button
                key={t}
                type="button"
                className={'type-choice' + (type === t ? ' is-selected' : '')}
                onClick={() => setType(t)}
                style={{ '--choice-color': TYPE_COLOR[t] } as React.CSSProperties}
              >
                {type === t && <motion.span layoutId="type-choice-bg" className="type-choice-bg" transition={SPRING} />}
                <span className="type-choice-mark" />
                <span className="type-choice-body">
                  <span className="type-choice-short">{meta.short}</span>
                  <span className="type-choice-label">{meta.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Stagger>

      <Stagger className="modal-actions">
        {onDelete && (
          <button className="btn btn-danger" onClick={onDelete}>Eliminar</button>
        )}
        <div className="modal-actions-right">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!name.trim()}>
            {company ? 'Guardar cambios' : 'Crear compañía'}
          </button>
        </div>
      </Stagger>
    </Modal>
  )
}
