import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { EmptyState } from '../components/common/EmptyState'
import { btnSecondary } from '../components/common/ui'
import { MessageSquare } from 'lucide-react'
import { supportRepository } from '../services/support'
import type { SupportThread } from '../types'
import { formatPrice } from '../utils/format'
import { formatDateTime } from '../utils/formatDate'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function SupportOrderPage() {
  const { orderId = '' } = useParams()
  const { hash } = useLocation()
  const guestToken = new URLSearchParams(hash.slice(1)).get('token') ?? undefined
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useDocumentTitle(thread ? `Заказ ${thread.orderNumber}` : 'Демо-заказ')

  useEffect(() => {
    let active = true
    void supportRepository.getCustomerThread(orderId, guestToken).then((result) => {
      if (!active) return
      if (result.ok) setThread(result.value)
      else setError(result.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [orderId, guestToken])

  if (loading) return <div className="container-x py-12" role="status">Загружаем заказ…</div>
  if (error) return <div className="container-x py-12" role="alert">{error}</div>
  if (!thread) return (
    <div className="container-x py-12">
      <EmptyState icon={MessageSquare} title="Заказ недоступен" text="Проверьте ссылку чата или войдите в аккаунт, которому принадлежит заказ.">
        <Link to="/support" className={btnSecondary}>Мои обращения</Link>
      </EmptyState>
    </div>
  )

  return (
    <div className="container-x py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="font-display text-sm uppercase tracking-[0.2em] text-red">Заказ и чат поддержки</p>
          <h1 className="mt-2 text-4xl">Заказ {thread.orderNumber}</h1>
          <p className="mt-2 text-sm text-silver">Создан {formatDateTime(thread.createdAt)}</p>
        </header>
        <p className="text-sm text-silver">Статус оплаты: {thread.paymentStatus ?? 'неизвестен'}. Чат доступен независимо от оплаты.</p>
        <section className="border border-line bg-coal">
          <h2 className="border-b border-line p-4 text-2xl">Состав заказа</h2>
          <ul className="divide-y divide-line">
            {thread.items.map((item, index) => (
              <li key={`${item.title}-${index}`} className="flex flex-wrap justify-between gap-2 p-4 text-sm">
                <span>{item.title} · {item.quantity} × {formatPrice(item.unitPrice, thread.currency)}</span>
                <strong>{formatPrice(item.quantity * item.unitPrice, thread.currency)}</strong>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-line p-4"><span>Итого</span><strong>{formatPrice(thread.total, thread.currency)}</strong></p>
        </section>
        <div className="flex flex-wrap gap-3">
          <Link to={`/support/${thread.orderId}${guestToken ? `#token=${encodeURIComponent(guestToken)}` : ''}`} className={btnSecondary}>Открыть чат поддержки</Link>
          <Link to="/support" className={btnSecondary}>Мои обращения</Link>
        </div>
      </div>
    </div>
  )
}
