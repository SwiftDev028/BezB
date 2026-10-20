import { CircleDollarSign, MessageSquare, PackageCheck, Plus, Truck } from 'lucide-react'
import type { FulfillmentStatus, OrderEvent, PaymentStatus } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { fulfillmentLabels, paymentLabels } from '../../utils/orders'

const icons = {
  created: Plus,
  payment_status: CircleDollarSign,
  fulfillment_status: Truck,
  comment: MessageSquare,
  delivery_info: PackageCheck,
} as const

function title(e: OrderEvent): string {
  switch (e.type) {
    case 'created':
      return 'Заказ создан'
    case 'payment_status':
      return `Оплата: ${paymentLabels[e.from as PaymentStatus] ?? e.from} → ${paymentLabels[e.to as PaymentStatus] ?? e.to}`
    case 'fulfillment_status':
      return `Выполнение: ${fulfillmentLabels[e.from as FulfillmentStatus] ?? e.from} → ${fulfillmentLabels[e.to as FulfillmentStatus] ?? e.to}`
    case 'comment':
      return 'Комментарий'
    case 'delivery_info':
      return 'Выдача товара'
  }
}

/** История только читается: события добавляются логикой заказа и не редактируются. */
export function OrderHistory({ events }: { events: OrderEvent[] }) {
  const sorted = [...events].reverse()
  return (
    <ol className="relative space-y-4 border-l border-line pl-6">
      {sorted.map((e) => {
        const Icon = icons[e.type]
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[2.2rem] top-0.5 grid size-6 place-items-center border border-line bg-graphite text-red">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <p className="font-semibold text-white">{title(e)}</p>
            {e.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-silver">{e.text}</p>}
            <p className="mt-1 text-xs text-silver">
              <time dateTime={e.at}>{formatDateTime(e.at)}</time> · {e.actor}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
