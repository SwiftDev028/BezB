import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Info, SearchX } from 'lucide-react'
import { FulfillmentBadge, PaymentBadge } from '../../components/admin/StatusBadge'
import { OrderHistory } from '../../components/admin/OrderHistory'
import { StatusChanger } from '../../components/admin/StatusChanger'
import { EmptyState } from '../../components/common/EmptyState'
import { btnPrimary, btnSecondary, inputClass } from '../../components/common/ui'
import { useOrders } from '../../context/OrdersContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatDateTime } from '../../utils/formatDate'
import { formatPrice } from '../../utils/format'
import {
  MAX_TEXT,
  addComment,
  changeFulfillmentStatus,
  changePaymentStatus,
  fulfillmentLabels,
  fulfillmentStatuses,
  paymentLabels,
  paymentStatuses,
  setDeliveryInfo,
} from '../../utils/orders'

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams()
  const { orders, loading, update } = useOrders()
  const order = orders.find((o) => o.id === id)
  useDocumentTitle(order ? `Заказ ${order.number}` : 'Заказ')

  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [delivery, setDelivery] = useState('')
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [deliverySaved, setDeliverySaved] = useState(false)

  // Поле выдачи подхватывает сохранённое значение при открытии заказа
  const savedDelivery = order?.delivery.note ?? ''
  useEffect(() => {
    setDelivery(savedDelivery)
  }, [order?.id, savedDelivery])

  if (loading) return <p role="status" className="text-silver">Загрузка…</p>
  if (!order)
    return (
      <EmptyState icon={SearchX} title="Заказ не найден" text="Возможно, демо-данные были сброшены.">
        <Link to="/admin/orders" className={btnSecondary}>К списку заказов</Link>
      </EmptyState>
    )

  const finalFulfillment = order.fulfillmentStatus === 'delivered' || order.fulfillmentStatus === 'cancelled'
  const paymentFinal = order.paymentStatus === 'refunded'

  const submitComment = async (e: FormEvent) => {
    e.preventDefault()
    const r = await update(order.id, (o, now) => addComment(o, comment, now))
    if (r.ok) {
      setComment('')
      setCommentError(null)
    } else setCommentError(r.error)
  }

  const submitDelivery = async (e: FormEvent) => {
    e.preventDefault()
    const r = await update(order.id, (o, now) => setDeliveryInfo(o, delivery, now))
    setDeliveryError(r.ok ? null : r.error)
    setDeliverySaved(r.ok)
  }

  return (
    <>
      <Link to="/admin/orders" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-silver hover:text-white">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Все заказы
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-4xl sm:text-5xl">Заказ {order.number}</h1>
        <PaymentBadge status={order.paymentStatus} />
        <FulfillmentBadge status={order.fulfillmentStatus} />
      </div>
      <p className="-mt-3 mb-6 text-sm text-silver">
        Создан {formatDateTime(order.createdAt)} · обновлён {formatDateTime(order.updatedAt)} · версия {order.version}
        {order.isDemo && ' · демонстрационный заказ'}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section aria-labelledby="items" className="border border-line bg-coal">
            <h2 id="items" className="border-b border-line p-4 text-2xl">Состав заказа</h2>
            <ul className="divide-y divide-line">
              {order.items.map((i) => (
                <li key={`${i.productId}-${i.region ?? ''}`} className="flex justify-between gap-3 p-4 text-sm">
                  <span className="min-w-0">
                    <Link to={`/product/${i.productId}`} className="font-semibold text-white hover:text-red-hot">{i.title}</Link>
                    <span className="block text-xs text-silver">
                      {i.platform}{i.region ? ` · регион: ${i.region}` : ''} · {i.quantity} × {formatPrice(i.unitPrice, order.currency)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatPrice(i.unitPrice * i.quantity, order.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-baseline justify-between border-t border-line p-4">
              <span className="text-silver">Итого (демонстрационная сумма)</span>
              <span className="font-display text-3xl font-bold">{formatPrice(order.total, order.currency)}</span>
            </p>
          </section>

          <section aria-labelledby="customer" className="border border-line bg-coal p-4">
            <h2 id="customer" className="mb-3 text-2xl">Покупатель</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-wider text-silver">Имя</dt><dd className="mt-0.5">{order.customer.name}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-silver">Email</dt><dd className="mt-0.5 break-all">{order.customer.email}</dd></div>
            </dl>
          </section>

          <section aria-labelledby="delivery" className="border border-line bg-coal p-4">
            <h2 id="delivery" className="mb-3 text-2xl">Выдача цифрового товара</h2>
            <p className="mb-3 flex gap-2 border-l-4 border-red bg-ink p-3 text-sm text-silver">
              <Info className="mt-0.5 size-4 shrink-0 text-red" aria-hidden="true" />
              Фиксируйте только факт и способ выдачи (когда, куда, кто подтвердил). Не вносите сами коды, ключи и пароли:
              демо-хранилище в браузере не защищено.
            </p>
            <form onSubmit={submitDelivery} className="space-y-3">
              <label htmlFor="delivery-note" className="block text-xs font-semibold uppercase tracking-wider text-silver">Информация о выдаче</label>
              <textarea
                id="delivery-note"
                rows={4}
                maxLength={MAX_TEXT}
                value={delivery}
                disabled={order.fulfillmentStatus === 'cancelled'}
                onChange={(e) => { setDelivery(e.target.value); setDeliverySaved(false) }}
                className={`${inputClass} py-2`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={order.fulfillmentStatus === 'cancelled'} className={btnPrimary}>Сохранить</button>
                {order.delivery.updatedAt && <span className="text-xs text-silver">Обновлено {formatDateTime(order.delivery.updatedAt)}</span>}
                {deliverySaved && <span role="status" className="text-sm text-white">Сохранено</span>}
              </div>
              {deliveryError && <p role="alert" className="text-sm font-medium text-red-hot">{deliveryError}</p>}
            </form>
          </section>

          <section aria-labelledby="history" className="border border-line bg-coal p-4 sm:p-6">
            <h2 id="history" className="mb-5 text-2xl">История изменений</h2>
            <OrderHistory events={order.history} />
          </section>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="statuses" className="space-y-4 border border-line bg-coal p-4">
            <h2 id="statuses" className="text-2xl">Статусы</h2>
            <p className="text-xs text-silver">Статусы меняются вручную. Подтверждения платежа от провайдера здесь нет: оплата не подключена.</p>
            <StatusChanger
              label="Оплата"
              current={order.paymentStatus}
              options={paymentStatuses}
              labels={paymentLabels}
              disabled={paymentFinal}
              disabledReason="После возврата статус оплаты не меняется."
              onApply={async (to, note) => {
                const r = await update(order.id, (o, now) => changePaymentStatus(o, to, now, note))
                return r.ok ? null : r.error
              }}
            />
            <StatusChanger
              label="Выполнение"
              current={order.fulfillmentStatus}
              options={fulfillmentStatuses}
              labels={fulfillmentLabels}
              disabled={finalFulfillment}
              disabledReason="Заказ в конечном статусе — изменить его нельзя."
              onApply={async (to, note) => {
                const r = await update(order.id, (o, now) => changeFulfillmentStatus(o, to, now, note))
                return r.ok ? null : r.error
              }}
            />
          </section>

          <section aria-labelledby="comments" className="border border-line bg-coal p-4">
            <h2 id="comments" className="mb-3 text-2xl">Добавить комментарий</h2>
            <form onSubmit={submitComment} className="space-y-3">
              <label htmlFor="comment-text" className="sr-only">Комментарий</label>
              <textarea
                id="comment-text"
                rows={3}
                maxLength={MAX_TEXT}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                aria-invalid={Boolean(commentError)}
                aria-describedby={commentError ? 'comment-error' : undefined}
                className={`${inputClass} py-2`}
                placeholder="Заметка для команды"
              />
              {commentError && <p id="comment-error" role="alert" className="text-sm font-medium text-red-hot">{commentError}</p>}
              <button type="submit" className={`${btnPrimary} w-full`}>Добавить</button>
            </form>
          </section>
        </div>
      </div>
    </>
  )
}
