import type { Currency } from './index'

/** Статус оплаты. Меняется вручную; при подключении платёжного провайдера — по его уведомлениям. */
export type PaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'

/** Статус выполнения заказа. `delivered` и `cancelled` — конечные. */
export type FulfillmentStatus = 'new' | 'processing' | 'awaiting_supplier' | 'delivered' | 'cancelled'

/** Откуда появился заказ: оформлен покупателем на сайте или создан вручную в админке. */
export type OrderSource = 'checkout' | 'admin'

export type OrderEventType =
  | 'created'
  | 'payment_status'
  | 'fulfillment_status'
  | 'comment'
  | 'delivery_info'

/** Снимок позиции на момент заказа: цена и название не меняются, даже если каталог изменится. */
export interface OrderItem {
  id?: string
  productId: string
  title: string
  platform: string
  unitPrice: number
  quantity: number
  region?: string
  denomination?: number | null
  denominationCurrency?: string | null
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
  customer: { name: string; email: string; phone?: string; address?: string; comment?: string }
  consentAt?: string
  deliveryEmailSentAt?: string
  deliveryEmailSentBy?: string
  items: OrderItem[]
  total: number
  currency: Currency
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  delivery: DeliveryInfo
  history: OrderEvent[]
  /** Все заказы прототипа — демонстрационные */
  isDemo: boolean
  /** Нет у заказов, созданных до появления поля (демо-данные, ручные заказы) */
  source?: OrderSource
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
