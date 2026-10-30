import { Link } from 'react-router-dom'
import type { CheckoutOrder } from '../../services/orders/placeCheckoutOrder'
import { formatPrice } from '../../utils/format'
import { btnPrimary } from '../common/ui'

export function CheckoutResult({ order }: { order: CheckoutOrder }) {
  const tokenFragment = order.supportAccessToken
    ? `#token=${encodeURIComponent(order.supportAccessToken)}`
    : ''

  return (
    <div className="container-x py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-5">
        <p className="font-display text-sm uppercase tracking-[0.2em] text-red">Заказ создан без оплаты</p>
        <h1 className="text-4xl sm:text-5xl">Заказ {order.number}</h1>
        <p className="text-silver">Персональный чат с менеджером создан для этого заказа. Доступ к чату не подтверждает оплату и не запускает выдачу товара.</p>
        <ul className="divide-y divide-line border border-line bg-coal">
          {order.items.map((item, index) => (
            <li key={`${item.productId}-${item.region ?? ''}-${index}`} className="flex justify-between gap-3 p-4 text-sm">
              <span className="min-w-0">{item.title} · {item.quantity} × {formatPrice(item.unitPrice, order.currency)}</span>
              <strong>{formatPrice(item.quantity * item.unitPrice, order.currency)}</strong>
            </li>
          ))}
        </ul>
        <Link to={`/support/${encodeURIComponent(order.id)}${tokenFragment}`} className={btnPrimary}>
          Открыть чат менеджера
        </Link>
      </div>
    </div>
  )
}
