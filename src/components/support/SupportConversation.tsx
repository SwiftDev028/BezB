import { useState, type FormEvent } from 'react'
import type { SupportAuthor, SupportMessage, SupportThread } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { btnPrimary, inputClass } from '../common/ui'
import { supportRepository } from '../../services/support'
import type { Result } from '../../types'

export function SupportConversation({
  thread,
  author,
  guestToken,
  onChange,
}: {
  thread: SupportThread
  author: SupportAuthor
  guestToken?: string
  onChange: (thread: SupportThread) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result: Result<SupportMessage> = author === 'customer'
        ? await supportRepository.sendCustomerMessage(thread.orderId, guestToken, text)
        : await supportRepository.sendAdminMessage(thread.orderId, text)
      if (result.ok) {
        onChange({
          ...thread,
          messages: [...thread.messages, result.value],
          lastMessageAt: result.value.sentAt,
        })
        setText('')
      } else {
        setError(result.error)
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Не удалось отправить сообщение.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 border border-line bg-coal p-4 sm:p-5" aria-label="Переписка">
      <div className="space-y-3" role="log" aria-live="polite">
        {thread.messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-silver">Переписка пока пуста. Напишите первое сообщение.</p>
        ) : (
          thread.messages.map((message) => {
            const fromSupport = message.author === 'support'
            return (
              <article
                key={message.id}
                className={`max-w-[95%] whitespace-pre-wrap break-words border p-3 sm:max-w-[85%] ${
                  fromSupport ? 'ml-auto border-red/50 bg-red/10' : 'border-line bg-graphite'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <strong className="text-white">{fromSupport ? 'Поддержка' : 'Покупатель'}</strong>
                  <time className="text-silver" dateTime={message.sentAt}>{formatDateTime(message.sentAt)}</time>
                </div>
                <p className="text-sm text-silver">{message.text}</p>
              </article>
            )
          })
        )}
      </div>

      {thread.status === 'closed' ? (
        <p role="status" className="border border-line p-3 text-sm text-silver">
          Обращение закрыто. {author === 'customer' ? 'Ответить можно после его повторного открытия поддержкой.' : 'Откройте обращение, чтобы продолжить переписку.'}
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-3 border-t border-line pt-4">
          <label htmlFor={`support-message-${thread.orderId}-${author}`} className="block text-sm font-semibold">
            {author === 'customer' ? 'Ваше сообщение' : 'Ответ поддержки'}
          </label>
          <textarea
            id={`support-message-${thread.orderId}-${author}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
            rows={4}
            required
            className={`${inputClass} py-2`}
            placeholder="Введите сообщение…"
          />
          {error && <p role="alert" className="text-sm text-red-hot">{error}</p>}
          <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>
            {busy ? 'Отправляем…' : 'Отправить'}
          </button>
        </form>
      )}
    </section>
  )
}
