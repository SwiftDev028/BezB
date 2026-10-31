import { useCallback, useEffect, useState } from 'react'
import { SupportConversation } from '../support/SupportConversation'
import { supportRepository } from '../../services/support'
import type { ManualDelivery, SupportThread } from '../../types'

function mergeThread(current: SupportThread, incoming: SupportThread): SupportThread {
  const currentUpdatedAt = current.updatedAt ?? current.lastMessageAt ?? current.createdAt
  const incomingUpdatedAt = incoming.updatedAt ?? incoming.lastMessageAt ?? incoming.createdAt
  const incomingIsNewer = incomingUpdatedAt >= currentUpdatedAt
  const messages = new Map(current.messages.map((message) => [message.id, message]))
  for (const message of incoming.messages) messages.set(message.id, message)
  const currentLastMessageAt = current.lastMessageAt ?? ''
  const incomingLastMessageAt = incoming.lastMessageAt ?? ''

  return {
    ...current,
    ...(incomingIsNewer ? incoming : {}),
    messages: [...messages.values()].sort((a, b) =>
      a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
    ),
    lastMessageAt: incomingLastMessageAt >= currentLastMessageAt
      ? incoming.lastMessageAt
      : current.lastMessageAt,
  }
}

export function AdminOrderSupportChat({
  orderId,
  manualDeliveries,
}: {
  orderId: string
  manualDeliveries: ManualDelivery[]
}) {
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const acceptThread = useCallback((incoming: SupportThread) => {
    if (incoming.orderId !== orderId) return
    setThread((current) => current?.orderId === orderId
      ? mergeThread(current, incoming)
      : incoming)
  }, [orderId])

  useEffect(() => {
    let active = true
    let requestInFlight = false
    setLoading(true)
    setError('')
    setThread(null)

    const refresh = async () => {
      if (!active || requestInFlight) return
      requestInFlight = true
      try {
        const result = await supportRepository.getAdminThread(orderId)
        if (!active) return
        if (result.ok) {
          acceptThread(result.value)
          setError('')
        } else {
          setError(result.error)
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Не удалось обновить чат заказа.')
      } finally {
        requestInFlight = false
        if (active) setLoading(false)
      }
    }

    void refresh()
    const timerId = window.setInterval(() => void refresh(), 5000)
    return () => {
      active = false
      window.clearInterval(timerId)
    }
  }, [orderId, acceptThread])

  return (
    <section aria-labelledby="order-support-chat" className="space-y-4 border border-line bg-coal p-4 sm:p-6">
      <div>
        <h2 id="order-support-chat" className="text-2xl">Чат с покупателем по этому заказу</h2>
        <p className="mt-1 text-sm text-silver">Переписка связана с заказом и синхронизируется с разделом поддержки.</p>
      </div>
      {loading && !thread && <p role="status" className="text-sm text-silver">Загружаем переписку…</p>}
      {error && <p role="alert" className="text-sm text-red-hot">{error}</p>}
      {thread && thread.orderId === orderId && (
        <SupportConversation
          thread={thread}
          author="support"
          manualDeliveries={manualDeliveries}
          onChange={acceptThread}
        />
      )}
    </section>
  )
}
