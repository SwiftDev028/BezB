import type { FulfillmentStatus, PaymentStatus } from '../../types'
import { fulfillmentLabels, paymentLabels } from '../../utils/orders'

const paymentStyle: Record<PaymentStatus, string> = {
  paid: 'bg-white text-ink',
  pending: 'bg-steel text-white',
  unpaid: 'border border-line text-silver',
  failed: 'bg-red-dark text-white',
  refunded: 'border border-silver text-white',
}

const fulfillmentStyle: Record<FulfillmentStatus, string> = {
  new: 'border border-line text-silver',
  processing: 'bg-steel text-white',
  awaiting_supplier: 'bg-steel text-white',
  delivered: 'bg-white text-ink',
  cancelled: 'bg-red-dark text-white',
}

const base = 'inline-block whitespace-nowrap px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider'

/** Статус всегда передаётся текстом, а не только цветом. */
export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`${base} ${paymentStyle[status]}`}>{paymentLabels[status]}</span>
}

export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  return <span className={`${base} ${fulfillmentStyle[status]}`}>{fulfillmentLabels[status]}</span>
}
