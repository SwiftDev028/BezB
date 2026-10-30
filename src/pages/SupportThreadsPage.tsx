import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { MessageSquare } from 'lucide-react'
import { supportRepository } from '../services/support'
import type { SupportThread } from '../types'
import { formatDateTime } from '../utils/formatDate'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAuth } from '../context/AuthContext'

export default function SupportThreadsPage() {
  useDocumentTitle('Мои обращения')
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return
    setThreads([])
    setError('')
    if (!userId) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void supportRepository.listCustomerThreads().then((result) => {
      if (!active) return
      if (result.ok) setThreads(result.value)
      else setError(result.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [authLoading, userId])

  if (authLoading || loading) return <div className="container-x py-12" role="status">Загружаем обращения…</div>

  return (
    <div className="container-x py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-4xl sm:text-5xl">Мои обращения</h1>
        <p className="mb-6 text-sm text-silver">Ваши обращения к менеджеру по заказам, привязанным к аккаунту.</p>
        {!user && <p className="mb-6 border-l-4 border-red bg-coal p-3 text-sm text-silver">Гостевые обращения открываются по защищённой ссылке из оформления заказа. Сохраните эту ссылку, чтобы вернуться к чату на другом устройстве.</p>}
        {error && <p role="alert" className="mb-4 border border-red p-3 text-red-hot">{error}</p>}
        {threads.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Обращений пока нет" text="Оформите заказ или откройте защищённую ссылку гостевого чата." />
        ) : (
          <ul className="space-y-3">
            {threads.map((thread) => {
              const last = thread.messages.at(-1)?.text ?? thread.lastMessage
              return (
                <li key={thread.orderId} className="border border-line bg-coal p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-xl">Заказ {thread.orderNumber}</h2>
                    <span className="text-xs text-silver">{thread.status === 'open' ? 'Открыто' : 'Закрыто'}</span>
                  </div>
                  <p className="mt-2 truncate text-sm text-silver">{last ?? 'Переписка пока пуста'}</p>
                  {thread.lastMessageAt && <p className="mt-1 text-xs text-silver">{formatDateTime(thread.lastMessageAt)}</p>}
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <Link to={`/support/${thread.orderId}`} className="min-h-11 inline-flex items-center text-white underline underline-offset-4">
                      Открыть переписку
                    </Link>
                    <Link to={`/support/order/${thread.orderId}`} className="min-h-11 inline-flex items-center text-silver underline underline-offset-4">
                      К заказу
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
