import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { btnPrimary, btnSecondary, inputClass } from '../common/ui'

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-silver sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

const noticeStyle = {
  error: { cls: 'border-red bg-red/10', Icon: CircleAlert, role: 'alert' as const },
  success: { cls: 'border-line bg-graphite', Icon: CircleCheck, role: 'status' as const },
  info: { cls: 'border-line bg-coal', Icon: Info, role: 'status' as const },
}

export function Notice({ tone, children, onClose }: { tone: 'error' | 'success' | 'info'; children: ReactNode; onClose?: () => void }) {
  const { cls, Icon, role } = noticeStyle[tone]
  return (
    <div role={role} className={`mb-4 flex items-start gap-3 border p-3 text-sm ${cls}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${tone === 'error' ? 'text-red-hot' : 'text-white'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 break-words">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Закрыть сообщение" className="grid size-8 shrink-0 place-items-center text-silver hover:text-white">
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

const tagTone = {
  neutral: 'border border-line text-silver',
  strong: 'bg-white text-ink',
  muted: 'bg-steel text-white',
  danger: 'bg-red-dark text-white',
} as const

/** Статус всегда словом, не только цветом. */
export function Tag({ tone = 'neutral', children }: { tone?: keyof typeof tagTone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-wider ${tagTone[tone]}`}>
      {children}
    </span>
  )
}

export function Panel({ title, hint, children, className = '' }: { title?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border border-line bg-coal p-4 sm:p-5 ${className}`}>
      {title && <h2 className="text-xl sm:text-2xl">{title}</h2>}
      {hint && <p className="mt-1 text-sm text-silver">{hint}</p>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

export function Field({ label, hint, error, htmlFor, children, className = '' }: { label: string; hint?: ReactNode; error?: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-white">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-err`} role="alert" className="mt-1 text-sm text-red-hot">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-silver">{hint}</p>
      )}
    </div>
  )
}

/** Открытые окна по порядку: Escape и Tab обрабатывает только верхнее. */
const modalStack: object[] = []

/** Модальное окно: фокус внутри, Escape закрывает, фон не прокручивается. */
export function Modal({ title, onClose, children, footer, wide = false, side = false }: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** Панель справа на широких экранах (форма редактирования) */
  side?: boolean
}) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  // Эффект ниже выполняется один раз, поэтому актуальный onClose берём из ref, а не из замыкания
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const previous = document.body.style.overflow
    const active = document.activeElement as HTMLElement | null
    const self = {}
    modalStack.push(self)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== self) return
      if (e.key === 'Escape') closeRef.current()
      if (e.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      modalStack.splice(modalStack.indexOf(self), 1)
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
      active?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className={`fixed inset-0 z-[90] flex bg-black/75 ${side ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-4'}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[100dvh] w-full flex-col border border-line bg-ink outline-none ${side ? 'h-[100dvh] max-w-3xl' : `${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh]`}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 id={titleId} className="min-w-0 break-words text-xl sm:text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Закрыть" className="grid size-11 shrink-0 place-items-center text-silver hover:text-white">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>
  )
}

/**
 * Подтверждение опасного действия. С requireText кнопка активна, только когда введён нужный текст
 * (например, SKU при удалении) — случайный клик ничего не удалит.
 */
export function ConfirmDialog({ title, children, confirmLabel, danger = false, requireText, busy = false, onConfirm, onCancel }: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  requireText?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const ready = !requireText || typed.trim() === requireText
  return (
    <Modal
      title={title}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onCancel} disabled={busy}>Отмена</button>
          <button
            type="button"
            className={`${btnPrimary} ${danger ? 'bg-red-dark hover:bg-red' : ''}`}
            disabled={!ready || busy}
            onClick={onConfirm}
          >
            {busy ? 'Выполняем…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-silver">{children}</div>
      {requireText && (
        <div className="mt-4">
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-white">
            Для подтверждения введите: <code className="break-all text-red-hot">{requireText}</code>
          </label>
          <input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputClass} />
        </div>
      )}
    </Modal>
  )
}
