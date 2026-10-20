import type { Currency } from './index'

/** Статус оплаты. Меняется вручную; при подключении платёжного провайдера — по его уведомлениям. */
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'

/** Статус выполнения заказа. `delivered` и `cancelled` — конечные. */
export type FulfillmentStatus = 'new' | 'processing' | 'awaiting_supplier' | 'delivered' | 'cancelled'

export type OrderEventType =
  | 'created'
  | 'payment_status'
  | 'fulfillment_status'
  | 'comment'
  | 'delivery_info'

/** Снимок позиции на момент заказа: цена и название не меняются, даже если каталог изменится. */
export interface OrderItem {
  productId: string
  title: string
  platform: string
  unitPrice: number
  quantity: number
  region?: string
}

export interface OrderEvent {
  id: string
  type: OrderEventType
  at: string // ISO
  actor: string
  from?: string
  to?: string
  text?: string
}

export interface DeliveryInfo {
  /** Свободный текст: как и когда выдан товар. Секреты (коды, пароли) здесь хранить нельзя. */
  note: string
  updatedAt?: string
}

export interface Order {
  id: string
  /** Человекочитаемый номер, например BZB-1001 */
  number: string
  /** Растёт при каждом изменении — основа для проверки конфликтов на backend */
  version: number
  createdAt: string
  updatedAt: string
  customer: { name: string; email: string }
  items: OrderItem[]
  total: number
  currency: Currency
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  delivery: DeliveryInfo
  history: OrderEvent[]
  /** Все заказы прототипа — демонстрационные */
  isDemo: boolean
}

export type OrderSortKey = 'new' | 'old' | 'total-desc' | 'total-asc'

export interface OrderFilters {
  query: string
  payment: PaymentStatus | 'all'
  fulfillment: FulfillmentStatus | 'all'
  /** YYYY-MM-DD, включительно */
  dateFrom: string
  dateTo: string
  sort: OrderSortKey
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }
