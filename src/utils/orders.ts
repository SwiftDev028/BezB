import type {
  FulfillmentStatus,
  Order,
  OrderEvent,
  OrderEventType,
  OrderFilters,
  OrderItem,
  OrderSortKey,
  OrderSource,
  PaymentStatus,
  Product,
  Result,
} from '../types'

export const ACTOR = 'Администратор (демо)'
export const MAX_TEXT = 2000

export const paymentLabels: Record<PaymentStatus, string> = {
  unpaid: 'Не оплачен',
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  failed: 'Ошибка оплаты',
  refunded: 'Возврат',
}

export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  new: 'Ожидает обработки',
  processing: 'В работе',
  awaiting_supplier: 'Ждём поставщика',
  delivered: 'Выдан',
  cancelled: 'Отменён',
}

export const paymentStatuses = Object.keys(paymentLabels) as PaymentStatus[]
export const fulfillmentStatuses = Object.keys(fulfillmentLabels) as FulfillmentStatus[]

export const orderSortLabels: Record<OrderSortKey, string> = {
  new: 'Сначала новые',
  old: 'Сначала старые',
  'total-desc': 'Сумма: по убыванию',
  'total-asc': 'Сумма: по возрастанию',
}

export const defaultOrderFilters: OrderFilters = {
  query: '',
  payment: 'all',
  fulfillment: 'all',
  dateFrom: '',
  dateTo: '',
  sort: 'new',
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value })
const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })

export function nextOrderNumber(orders: Order[]): { id: string; number: string } {
  const max = orders.reduce((m, o) => {
    const n = Number(o.number.replace(/\D/g, ''))
    return Number.isFinite(n) && n > m ? n : m
  }, 1000)
  return { id: `ord-${max + 1}`, number: `BZB-${max + 1}` }
}

function event(order: Order, type: OrderEventType, at: string, extra: Partial<OrderEvent> = {}): OrderEvent {
  return { id: `${order.id}-e${order.history.length + 1}`, type, at, actor: ACTOR, ...extra }
}

/** Применяет изменение: добавляет событие в историю, повышает версию. Исходный объект не мутируется. */
function touch(order: Order, ev: OrderEvent, patch: Partial<Order> = {}): Order {
  return { ...order, ...patch, version: order.version + 1, updatedAt: ev.at, history: [...order.history, ev] }
}

export function orderTotal(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
}

export interface NewOrderInput {
  customer: { name: string; email: string }
  lines: { productId: string; quantity: number; region?: string }[]
}

export function createOrder(
  input: NewOrderInput,
  existing: Order[],
  lookup: (id: string) => Product | undefined,
  now: string,
  note = 'Заказ создан вручную (демо)',
  options: { paymentStatus?: PaymentStatus; source?: OrderSource } = {},
): Result<Order> {
  const items: OrderItem[] = []
  for (const line of input.lines) {
    const p = lookup(line.productId)
    if (!p) return fail(`Товар не найден: ${line.productId}`)
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10)
      return fail('Количество должно быть целым числом от 1 до 10.')
    items.push({
      productId: p.id,
      title: p.title,
      platform: p.platform,
      unitPrice: p.price,
      quantity: line.quantity,
      region: line.region,
    })
  }
  if (items.length === 0) return fail('В заказе нет позиций.')
  const name = input.customer.name.trim()
  const email = input.customer.email.trim()
  if (name.length < 2) return fail('Укажите имя покупателя.')
  if (!email) return fail('Укажите email покупателя.')

  const { id, number } = nextOrderNumber(existing)
  const base: Order = {
    id,
    number,
    version: 1,
    createdAt: now,
    updatedAt: now,
    customer: { name, email },
    items,
    total: orderTotal(items),
    currency: 'RUB',
    paymentStatus: options.paymentStatus ?? 'unpaid',
    fulfillmentStatus: 'new',
    delivery: { note: '' },
    history: [],
    isDemo: true,
    ...(options.source ? { source: options.source } : {}),
  }
  return ok({ ...base, history: [event(base, 'created', now, { text: note })] })
}

export function changePaymentStatus(
  order: Order,
  to: PaymentStatus,
  now: string,
  note?: string,
): Result<Order> {
  const from = order.paymentStatus
  if (!paymentStatuses.includes(to)) return fail('Неизвестный статус оплаты.')
  if (from === to) return fail('Этот статус оплаты уже установлен.')
  if (to === 'refunded' && from !== 'paid') return fail('Возврат возможен только для оплаченного заказа.')
  if (to === 'paid' && order.fulfillmentStatus === 'cancelled')
    return fail('Нельзя отметить оплаченным отменённый заказ.')
  if (from === 'refunded') return fail('После возврата статус оплаты менять нельзя.')
  return ok(touch(order, event(order, 'payment_status', now, { from, to, text: cleanText(note) }), { paymentStatus: to }))
}

export function changeFulfillmentStatus(
  order: Order,
  to: FulfillmentStatus,
  now: string,
  note?: string,
): Result<Order> {
  const from = order.fulfillmentStatus
  if (!fulfillmentStatuses.includes(to)) return fail('Неизвестный статус выполнения.')
  if (from === to) return fail('Этот статус выполнения уже установлен.')
  if (from === 'delivered' || from === 'cancelled')
    return fail('Заказ в конечном статусе: изменить его нельзя. При необходимости создайте новый заказ.')
  if (to === 'delivered') {
    if (order.paymentStatus !== 'paid') return fail('Выдать товар можно только по оплаченному заказу.')
    if (order.delivery.note.trim() === '') return fail('Сначала заполните информацию о выдаче.')
  }
  return ok(touch(order, event(order, 'fulfillment_status', now, { from, to, text: cleanText(note) }), { fulfillmentStatus: to }))
}

export function addComment(order: Order, text: string, now: string): Result<Order> {
  const t = text.trim()
  if (!t) return fail('Комментарий не может быть пустым.')
  if (t.length > MAX_TEXT) return fail(`Комментарий длиннее ${MAX_TEXT} символов.`)
  return ok(touch(order, event(order, 'comment', now, { text: t })))
}

/** В историю пишется только факт обновления — сам текст выдачи там не дублируется. */
export function setDeliveryInfo(order: Order, note: string, now: string): Result<Order> {
  if (order.fulfillmentStatus === 'cancelled') return fail('Заказ отменён: информацию о выдаче менять нельзя.')
  const t = note.trim()
  if (t.length > MAX_TEXT) return fail(`Текст длиннее ${MAX_TEXT} символов.`)
  if (t === order.delivery.note) return fail('Информация о выдаче не изменилась.')
  const text = t === '' ? 'Информация о выдаче очищена' : 'Информация о выдаче обновлена'
  return ok(touch(order, event(order, 'delivery_info', now, { text }), { delivery: { note: t, updatedAt: now } }))
}

function cleanText(text?: string): string | undefined {
  const t = text?.trim()
  return t ? t.slice(0, MAX_TEXT) : undefined
}

// ---------- Поиск, фильтры, сортировка ----------

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim()
}

export function localDateKey(iso: string): string {
  const d = new Date(iso)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function matchesOrderQuery(order: Order, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = norm(
    [order.number, order.customer.name, order.customer.email, ...order.items.map((i) => i.title)].join(' '),
  )
  return words.every((w) => hay.includes(w))
}

export function sortOrders(list: Order[], sort: OrderSortKey): Order[] {
  const copy = [...list]
  switch (sort) {
    case 'old':
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    case 'total-desc':
      return copy.sort((a, b) => b.total - a.total)
    case 'total-asc':
      return copy.sort((a, b) => a.total - b.total)
    case 'new':
    default:
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}

export function filterOrders(orders: Order[], f: OrderFilters): Order[] {
  const filtered = orders.filter((o) => {
    if (f.payment !== 'all' && o.paymentStatus !== f.payment) return false
    if (f.fulfillment !== 'all' && o.fulfillmentStatus !== f.fulfillment) return false
    const day = localDateKey(o.createdAt)
    if (f.dateFrom && day < f.dateFrom) return false
    if (f.dateTo && day > f.dateTo) return false
    return matchesOrderQuery(o, f.query)
  })
  return sortOrders(filtered, f.sort)
}

export function orderStats(orders: Order[]) {
  return {
    total: orders.length,
    awaitingPayment: orders.filter((o) => (o.paymentStatus === 'unpaid' || o.paymentStatus === 'pending') && o.fulfillmentStatus !== 'cancelled').length,
    toFulfil: orders.filter((o) => ['new', 'processing', 'awaiting_supplier'].includes(o.fulfillmentStatus) && o.paymentStatus === 'paid').length,
    delivered: orders.filter((o) => o.fulfillmentStatus === 'delivered').length,
  }
}

// ---------- Проверка данных из хранилища ----------

/** Минимальная проверка формы: защищает интерфейс от испорченного localStorage. */
export function isOrder(x: unknown): x is Order {
  if (!x || typeof x !== 'object') return false
  const o = x as Order
  return (
    typeof o.id === 'string' &&
    typeof o.number === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.total === 'number' &&
    Array.isArray(o.items) &&
    Array.isArray(o.history) &&
    !!o.customer &&
    typeof o.customer.name === 'string' &&
    paymentStatuses.includes(o.paymentStatus) &&
    fulfillmentStatuses.includes(o.fulfillmentStatus) &&
    !!o.delivery &&
    typeof o.delivery.note === 'string'
  )
}

export function parseOrders(raw: unknown): Order[] {
  return Array.isArray(raw) ? raw.filter(isOrder) : []
}
