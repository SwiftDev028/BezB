import { useState, type FormEvent } from 'react'
import type { SupportAuthor, SupportMessage, SupportThread } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { btnPrimary, inputClass } from '../common/ui'
import { supportRepository } from '../../services/support'
import type { ManualDelivery, Result } from '../../types'

const MANUAL_DELIVERY_PREFIX = 'BEZB_MANUAL_DELIVERY:'

function manualDeliveryIds(body: string): string[] | null {
  if (!body.startsWith(MANUAL_DELIVERY_PREFIX)) return null
  try {
    const payload: unknown = JSON.parse(body.slice(MANUAL_DELIVERY_PREFIX.length))
    if (!payload || typeof payload !== 'object' || !('delivery_ids' in payload) || !Array.isArray(payload.delivery_ids)) {
      return []
    }
    return [...new Set(payload.delivery_ids.filter((id): id is string => typeof id === 'string'))]
  } catch {
    return []
  }
}

function DeliveredItem({ delivery }: { delivery: ManualDelivery }) {
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState('')
  const fields = [
    ['Код', delivery.activationCode],
    ['Логин', delivery.login],
    ['Пароль', delivery.password],
    ['Дополнительные данные', delivery.additionalData],
  ].filter((field): field is [string, string] => Boolean(field[1]))
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setCopyError('')
    } catch (error) {
      setCopyError(error instanceof Error ? `Не удалось скопировать ${label.toLowerCase()}: ${error.message}` : `Не удалось скопировать ${label.toLowerCase()}.`)
    }
  }
  return (
    <article className="space-y-3 border border-green-700/50 bg-graphite p-4" aria-label={`Выданный товар: ${delivery.title}`}>
      <h3 className="text-lg font-semibold text-white">🎁 Ваш заказ готов!</h3>
      <p className="text-sm text-silver"><strong className="text-white">{delivery.title}</strong></p>
      <p className="text-xs text-silver">Статус: Выдан</p>
      {delivery.revision > 1 && (
        <p role="status" className="border-l-2 border-red pl-2 text-xs text-silver">
          Данные выдачи обновлены {formatDateTime(delivery.updatedAt)}. Используйте эту актуальную версию.
        </p>
      )}
      {fields.map(([label, value]) => (
        <div key={label} className="space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="text-sm text-silver">{label}:</span>
            <button type="button" className="text-xs underline" onClick={() => void copy(label, value)}>
              Скопировать {label.toLowerCase()}
            </button>
          </div>
          {label === 'Логин' && value.includes('@')
            ? <a className="block break-all rounded bg-ink p-2 text-sm text-white underline" href={`mailto:${value}`}>{value}</a>
            : <code className="block whitespace-pre-wrap break-all rounded bg-ink p-2 text-sm text-white">{value}</code>}
          {copied === label && <span role="status" className="text-xs text-silver">Скопировано</span>}
        </div>
      ))}
      {delivery.instructions && (
        <div className="space-y-1 border-t border-line pt-3">
          <h4 className="text-sm font-semibold">Инструкция по активации</h4>
          <p className="whitespace-pre-wrap text-sm text-silver">{delivery.instructions}</p>
          <button type="button" className="text-xs underline" onClick={() => void copy('инструкцию', delivery.instructions)}>
            Скопировать инструкцию
          </button>
          {copied === 'инструкцию' && <span role="status" className="ml-2 text-xs text-silver">Скопировано</span>}
        </div>
      )}
      {copyError && <p role="alert" className="text-xs text-red-hot">{copyError}</p>}
    </article>
  )
}

export function SupportConversation({
  thread,
  author,
  guestToken,
  manualDeliveries = [],
  onChange,
}: {
  thread: SupportThread
  author: SupportAuthor
  guestToken?: string
  manualDeliveries?: ManualDelivery[]
  onChange: (thread: SupportThread) => void
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const latestDeliveryMessage = new Map<string, string>()
  if (manualDeliveries.length > 0) {
    for (const message of thread.messages) {
      for (const id of manualDeliveryIds(message.text) ?? []) {
        latestDeliveryMessage.set(id, message.id)
      }
    }
  }

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
            const fromSystem = message.author === 'system'
            const deliveryIds = manualDeliveryIds(message.text)
            if (deliveryIds) {
              const deliveriesById = new Map(manualDeliveries.map((delivery) => [delivery.id, delivery]))
              const messageDeliveries = deliveryIds.flatMap((id) => {
                if (manualDeliveries.length > 0 && latestDeliveryMessage.get(id) !== message.id) return []
                const delivery = deliveriesById.get(id)
                return delivery ? [delivery] : []
              })
              return (
                <article key={message.id} className="space-y-3" aria-label="Системное сообщение о выдаче">
                  {messageDeliveries.length > 0
                    ? messageDeliveries.map((delivery) => <DeliveredItem key={delivery.id} delivery={delivery} />)
                    : <p className="border border-line p-3 text-sm text-silver">Данные товара отправлены покупателю.</p>}
                </article>
              )
            }
            return (
              <article
                key={message.id}
                className={`max-w-[95%] whitespace-pre-wrap break-words border p-3 sm:max-w-[85%] ${
                  fromSystem
                    ? 'mx-auto border-line bg-ink text-center'
                    : fromSupport ? 'ml-auto border-red/50 bg-red/10' : 'border-line bg-graphite'
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <strong className="text-white">{fromSystem ? 'BezB · уведомление' : fromSupport ? 'Поддержка' : 'Покупатель'}</strong>
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
