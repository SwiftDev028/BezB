import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { SupportConversation } from '../components/support/SupportConversation'
import { EmptyState } from '../components/common/EmptyState'
import { btnSecondary } from '../components/common/ui'
import { supportRepository } from '../services/support'
import type { SupportThread } from '../types'
import { formatDateTime } from '../utils/formatDate'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

function mergeThread(current: SupportThread, incoming: SupportThread): SupportThread {
  const currentUpdatedAt = current.updatedAt ?? current.lastMessageAt ?? current.createdAt
  const incomingUpdatedAt = incoming.updatedAt ?? incoming.lastMessageAt ?? incoming.createdAt
  const incomingIsNewer = incomingUpdatedAt >= currentUpdatedAt
  const currentLastMessageAt = current.lastMessageAt ?? ''
  const incomingLastMessageAt = incoming.lastMessageAt ?? ''
  const messagesById = new Map(current.messages.map((message) => [message.id, message]))
  for (const message of incoming.messages) messagesById.set(message.id, message)

  return {
    ...current,
    ...(incomingIsNewer ? incoming : {}),
    messages: [...messagesById.values()].sort((a, b) =>
      a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
    ),
    lastMessageAt: incomingLastMessageAt >= currentLastMessageAt
      ? incoming.lastMessageAt
      : current.lastMessageAt,
    lastMessage: incomingLastMessageAt >= currentLastMessageAt
      ? incoming.lastMessage
      : current.lastMessage,
  }
}

export default function SupportInboxPage() {
  useDocumentTitle('Админ: поддержка')
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [guestLink, setGuestLink] = useState('')
  const [notice, setNotice] = useState('')
  const selectedIdRef = useRef<string | null>(null)
  const listRequestInFlight = useRef(false)
  const detailRequestsInFlight = useRef(new Set<string>())
  const threadsRevision = useRef(0)

  const load = useCallback(async () => {
    if (listRequestInFlight.current) return
    listRequestInFlight.current = true
    const requestRevision = threadsRevision.current
    try {
      const result = await supportRepository.listAdminThreads()
      if (requestRevision !== threadsRevision.current) return
      if (result.ok) {
        setThreads((current) => result.value.map((incoming) => {
          const existing = current.find((thread) => thread.orderId === incoming.orderId)
          return existing ? mergeThread(existing, incoming) : incoming
        }))
        setError('')
      } else {
        setError(result.error)
      }
    } catch (loadError) {
      if (requestRevision === threadsRevision.current) {
        setError(loadError instanceof Error ? loadError.message : 'Не удалось обновить список обращений.')
      }
    } finally {
      listRequestInFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const intervalId = window.setInterval(() => void load(), 5000)
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'bezb:support:threads') void load()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('storage', onStorage)
    }
  }, [load])

  const selected = useMemo(
    () => threads.find((thread) => thread.orderId === selectedId) ?? null,
    [threads, selectedId],
  )

  useEffect(() => {
    if (!selectedId) return
    let active = true
    const refresh = async () => {
      if (!active || detailRequestsInFlight.current.has(selectedId) || selectedIdRef.current !== selectedId) return
      detailRequestsInFlight.current.add(selectedId)
      const requestRevision = threadsRevision.current
      try {
        const result = await supportRepository.getAdminThread(selectedId)
        if (!active || selectedIdRef.current !== selectedId || requestRevision !== threadsRevision.current) return
        if (result.ok) {
          threadsRevision.current += 1
          setThreads((current) => current.map((thread) => {
            return thread.orderId === result.value.orderId ? mergeThread(thread, result.value) : thread
          }))
          setError('')
        } else {
          setError(result.error)
        }
      } catch (loadError) {
        if (active && selectedIdRef.current === selectedId) {
          setError(loadError instanceof Error ? loadError.message : 'Не удалось обновить переписку.')
        }
      } finally {
        detailRequestsInFlight.current.delete(selectedId)
      }
    }
    void refresh()
    const intervalId = window.setInterval(() => void refresh(), 5000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [selectedId])

  const selectThread = (thread: SupportThread) => {
    selectedIdRef.current = thread.orderId
    setSelectedId(thread.orderId)
  }

  const updateThread = (updated: SupportThread) => {
    threadsRevision.current += 1
    setThreads((current) => current.map((thread) =>
      thread.orderId === updated.orderId ? mergeThread(thread, updated) : thread,
    ))
  }

  const changeStatus = async () => {
    if (!selected) return
    const status = selected.status === 'open' ? 'closed' : 'open'
    const result = await supportRepository.setAdminStatus(selected.orderId, status)
    if (!result.ok) {
      setError(result.error)
      return
    }
    updateThread({ ...selected, status })
  }

  const reissueGuestLink = async () => {
    if (!selected) return
    setError('')
    setNotice('')
    const result = await supportRepository.reissueGuestAccess(selected.orderId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setGuestLink(`${window.location.origin}${import.meta.env.BASE_URL}support/${encodeURIComponent(selected.orderId)}#token=${encodeURIComponent(result.value)}`)
    setNotice('Выдана новая ссылка. Предыдущая гостевая ссылка отозвана.')
  }

  const revokeGuestLink = async () => {
    if (!selected) return
    setError('')
    setNotice('')
    const result = await supportRepository.revokeGuestAccess(selected.orderId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setGuestLink('')
    setNotice('Гостевая ссылка отозвана.')
  }

  const copyGuestLink = async () => {
    try {
      await navigator.clipboard.writeText(guestLink)
      setNotice('Защищённая ссылка скопирована. Передайте её покупателю по проверенному каналу.')
    } catch (copyError) {
      setError(copyError instanceof Error ? `Не удалось скопировать ссылку: ${copyError.message}` : 'Не удалось скопировать ссылку.')
    }
  }

  const shareDeliveredCodes = async () => {
    if (!selected) return
    const result = await supportRepository.sendDeliveredCodes(selected.orderId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const refreshed = await supportRepository.getAdminThread(selected.orderId)
    if (refreshed.ok) updateThread(refreshed.value)
    else setError(refreshed.error)
  }

  if (loading) return <p role="status" className="text-silver">Загружаем обращения…</p>

  const unreadCount = (thread: SupportThread) =>
    thread.unreadCount ?? thread.messages.filter((message) => message.author === 'customer' && !message.readBySupport).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl sm:text-4xl">Поддержка</h1>
        <p className="mt-2 text-sm text-silver">
          {supportRepository.kind === 'supabase'
            ? 'Диалоги хранятся в Supabase и доступны менеджерам с административными правами.'
            : 'Локальный прототип: обращения доступны только в этом браузере.'}
        </p>
      </div>
      {error && <p role="alert" className="border border-red p-3 text-sm text-red-hot">{error}</p>}
      {notice && <p role="status" className="border border-line p-3 text-sm text-silver">{notice}</p>}
      {threads.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Обращений пока нет" text="После оформления заказа диалог появится здесь автоматически." />
      ) : (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.4fr)]">
          <section aria-label="Список обращений" className="min-w-0 space-y-2">
            {threads.map((thread) => {
              const unread = unreadCount(thread)
              const last = thread.messages.at(-1)?.text ?? thread.lastMessage
              return (
                <button
                  type="button"
                  key={thread.orderId}
                  onClick={() => void selectThread(thread)}
                  className={`w-full min-w-0 border p-3 text-left transition-colors ${selectedId === thread.orderId ? 'border-red bg-graphite' : 'border-line bg-coal hover:border-silver'}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-white">Заказ {thread.orderNumber}</strong>
                    <span className={`text-xs ${thread.status === 'open' ? 'text-green-400' : 'text-silver'}`}>{thread.status === 'open' ? 'Открыто' : 'Закрыто'}</span>
                  </span>
                  <span className="mt-1 block text-xs text-silver">{thread.lastMessageAt ? `Последнее сообщение: ${formatDateTime(thread.lastMessageAt)}` : 'Переписка пуста'}</span>
                  <span className="mt-2 block truncate text-sm text-silver">{last ?? 'Нет сообщений'}</span>
                  {unread > 0 && <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-hot"><span className="size-2 rounded-full bg-red" /> {unread} новых</span>}
                </button>
              )
            })}
          </section>

          {selected ? (
            <section className="min-w-0 space-y-4">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                <div>
                  <h2 className="text-2xl">Заказ {selected.orderNumber}</h2>
                  <p className="text-xs text-silver">
                    Статус оплаты: {selected.paymentStatus ?? 'неизвестен'}
                    {' · '}Создан {formatDateTime(selected.createdAt)}
                  </p>
                </div>
                <button type="button" className={btnSecondary} onClick={() => void changeStatus()}>
                  {selected.status === 'open' ? 'Закрыть обращение' : 'Открыть повторно'}
                </button>
              </header>
              {selected.isGuest && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={btnSecondary} onClick={() => void reissueGuestLink()}>Выдать новую гостевую ссылку</button>
                  <button type="button" className={btnSecondary} onClick={() => void revokeGuestLink()}>Отозвать гостевую ссылку</button>
                  {guestLink && <button type="button" className={btnSecondary} onClick={() => void copyGuestLink()}>Скопировать новую ссылку</button>}
                </div>
              )}
              {selected.paymentStatus === 'paid' && selected.fulfillmentStatus === 'delivered' && (
                <button type="button" className={btnSecondary} onClick={() => void shareDeliveredCodes()}>
                  Отправить выданные коды в чат
                </button>
              )}
              <SupportConversation thread={selected} author="support" onChange={updateThread} />
              <Link to={`/admin/orders/${selected.orderId}`} className="inline-flex min-h-11 items-center text-sm text-silver underline underline-offset-4 hover:text-white">
                Открыть заказ в админ-панели
              </Link>
            </section>
          ) : (
            <p className="border border-dashed border-line p-6 text-sm text-silver">Выберите обращение, чтобы открыть переписку.</p>
          )}
        </div>
      )}
    </div>
  )
}
