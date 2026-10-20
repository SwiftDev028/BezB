import { useId, useState } from 'react'
import { btnPrimary, inputClass } from '../common/ui'

interface StatusChangerProps<T extends string> {
  label: string
  current: T
  options: T[]
  labels: Record<T, string>
  /** Возвращает текст ошибки или null при успехе */
  onApply: (to: T, note: string) => Promise<string | null>
  disabled?: boolean
  disabledReason?: string
}

/** Выбор нового статуса + необязательная причина. Правила переходов проверяет логика заказа, а не UI. */
export function StatusChanger<T extends string>({
  label,
  current,
  options,
  labels,
  onApply,
  disabled = false,
  disabledReason,
}: StatusChangerProps<T>) {
  const uid = useId()
  const [to, setTo] = useState<T | ''>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    if (!to) return
    setBusy(true)
    const err = await onApply(to, note)
    setBusy(false)
    setError(err)
    if (!err) {
      setTo('')
      setNote('')
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-3 border border-line p-4">
      <legend className="px-2 text-sm font-semibold text-white">{label}</legend>
      <p className="text-sm text-silver">Сейчас: <strong className="text-white">{labels[current]}</strong></p>
      {disabled && disabledReason && <p className="text-sm text-silver">{disabledReason}</p>}
      <div>
        <label htmlFor={`${uid}-to`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Новый статус</label>
        <select id={`${uid}-to`} value={to} onChange={(e) => { setTo(e.target.value as T | ''); setError(null) }} className={inputClass}>
          <option value="">Выберите статус</option>
          {options.filter((o) => o !== current).map((o) => <option key={o} value={o}>{labels[o]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-note`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Причина (необязательно)</label>
        <input id={`${uid}-note`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-hot">{error}</p>}
      <button type="button" onClick={apply} disabled={!to || busy} className={`${btnPrimary} w-full`}>Применить</button>
    </fieldset>
  )
}
