import { Link } from 'react-router-dom'
import { Info } from 'lucide-react'
import type { Order } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { formatPrice } from '../../utils/format'
import { FulfillmentBadge, PaymentBadge } from '../admin/StatusBadge'
import { btnPrimary, btnSecondary } from '../common/ui'

/** Результат оформления. Намеренно не похож на «успешную покупку»: ничего не оплачено и не выдано. */
export function CheckoutResult({ order }: { order: Order }) {
  return (
    <div className="container-x py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <p className="mb-1 font-display text-sm uppercase tracking-[0.2em] text-red">Демонстрационный режим</p>
        <h1 className="text-4xl sm:text-5xl" tabIndex={-1} id="checkout-result-title">
          Демо-заказ создан
        </h1>

        <p role="status" className="mt-4 text-lg text-silver">
          Номер заказа: <strong className="font-display text-2xl text-white">{order.number}</strong>
        </p>

        <div className="mt-5 flex gap-3 border border-red bg-red/10 p-4 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-red-hot" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-white">Заказ существует только в этом браузере.</p>
            <p className="text-silver">
              Он сохранён в localStorage вашего браузера, не отправлен на сервер и пропадёт при очистке данных сайта.
              Оплата не подключена: ничего не оплачено, товар не выдан, письмо не отправлено.
            </p>
          </div>
        </div>

        <section aria-labelledby="result-order" className="mt-6 border border-line bg-coal">
          <h2 id="result-order" className="border-b border-line p-4 text-2xl">Состав заказа</h2>
          <ul className="divide-y divide-line">
            {order.items.map((i) => (
              <li key={`${i.productId}-${i.region ?? ''}`} className="flex justify-between gap-3 p-4 text-sm">
                <span className="min-w-0">
                  {i.title}
                  <span className="block text-xs text-silver">
                    {i.quantity} × {formatPrice(i.unitPrice, order.currency)}
                    {i.region ? ` · регион: ${i.region}` : ''}
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

        <dl className="mt-4 grid gap-4 border border-line bg-coal p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wider text-silver">Покупатель</dt>
            <dd className="mt-1">{order.customer.name}</dd>
            <dd className="break-all text-silver">{order.customer.email}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider text-silver">Статусы</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              <PaymentBadge status={order.paymentStatus} />
              <FulfillmentBadge status={order.fulfillmentStatus} />
            </dd>
            <dd className="mt-2 text-xs text-silver">Создан {formatDateTime(order.createdAt)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to={`/admin/orders/${order.id}`} className={btnPrimary}>
            Открыть в админ-панели (демо)
          </Link>
          <Link to="/catalog" className={btnSecondary}>
            Вернуться в каталог
          </Link>
        </div>
      </div>
    </div>
  )
}
