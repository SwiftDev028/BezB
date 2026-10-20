import { describe, expect, it } from 'vitest'
import { getProduct } from '../data/products'
import type { Order } from '../types'
import {
  addComment,
  changeFulfillmentStatus,
  changePaymentStatus,
  createOrder,
  defaultOrderFilters,
  filterOrders,
  nextOrderNumber,
  orderStats,
  parseOrders,
  setDeliveryInfo,
  sortOrders,
} from './orders'

const T0 = '2026-10-10T12:00:00.000Z'
const T1 = '2026-10-11T12:00:00.000Z'
const T2 = '2026-10-12T12:00:00.000Z'

function make(existing: Order[] = [], lines = [{ productId: 'steam-topup-1000', quantity: 2 }], name = 'Демо Один', at = T0): Order {
  const r = createOrder({ customer: { name, email: 'demo@example.com' }, lines }, existing, getProduct, at)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe('создание заказа', () => {
  it('создаёт заказ со снимком цены, суммой и событием в истории', () => {
    const o = make()
    const p = getProduct('steam-topup-1000')!
    expect(o.number).toBe('BZB-1001')
    expect(o.items[0]).toMatchObject({ title: p.title, unitPrice: p.price, quantity: 2 })
    expect(o.total).toBe(p.price * 2)
    expect(o.paymentStatus).toBe('unpaid')
    expect(o.fulfillmentStatus).toBe('new')
    expect(o.history).toHaveLength(1)
    expect(o.history[0].type).toBe('created')
    expect(o.isDemo).toBe(true)
  })

  it('нумерует последовательно', () => {
    const a = make()
    expect(nextOrderNumber([a]).number).toBe('BZB-1002')
  })

  it('отклоняет неизвестный товар, пустой заказ и плохое количество', () => {
    const c = { name: 'Иван', email: 'i@example.com' }
    expect(createOrder({ customer: c, lines: [{ productId: 'нет', quantity: 1 }] }, [], getProduct, T0).ok).toBe(false)
    expect(createOrder({ customer: c, lines: [] }, [], getProduct, T0).ok).toBe(false)
    expect(createOrder({ customer: c, lines: [{ productId: 'steam-topup-500', quantity: 0 }] }, [], getProduct, T0).ok).toBe(false)
    expect(createOrder({ customer: { name: '', email: 'x' }, lines: [{ productId: 'steam-topup-500', quantity: 1 }] }, [], getProduct, T0).ok).toBe(false)
  })
})

describe('статусы и история', () => {
  it('смена статуса оплаты пишет событие и повышает версию, не мутируя исходный заказ', () => {
    const o = make()
    const paid = must(changePaymentStatus(o, 'paid', T1, 'Оплата получена вручную'))
    expect(paid.paymentStatus).toBe('paid')
    expect(paid.version).toBe(o.version + 1)
    expect(paid.history.at(-1)).toMatchObject({ type: 'payment_status', from: 'unpaid', to: 'paid', text: 'Оплата получена вручную' })
    expect(o.paymentStatus).toBe('unpaid')
    expect(o.history).toHaveLength(1)
  })

  it('не позволяет установить тот же статус', () => {
    expect(changePaymentStatus(make(), 'unpaid', T1).ok).toBe(false)
    expect(changeFulfillmentStatus(make(), 'new', T1).ok).toBe(false)
  })

  it('возврат возможен только после оплаты и является конечным', () => {
    const o = make()
    expect(changePaymentStatus(o, 'refunded', T1).ok).toBe(false)
    const refunded = must(changePaymentStatus(must(changePaymentStatus(o, 'paid', T1)), 'refunded', T2))
    expect(changePaymentStatus(refunded, 'paid', T2).ok).toBe(false)
  })

  it('выдача требует оплаты и заполненной информации о выдаче', () => {
    const o = make()
    expect(changeFulfillmentStatus(o, 'delivered', T1).ok).toBe(false)
    const paid = must(changePaymentStatus(o, 'paid', T1))
    expect(changeFulfillmentStatus(paid, 'delivered', T1).ok).toBe(false)
    const withInfo = must(setDeliveryInfo(paid, 'Выдано, проверено', T1))
    const done = must(changeFulfillmentStatus(withInfo, 'delivered', T2))
    expect(done.fulfillmentStatus).toBe('delivered')
  })

  it('конечные статусы нельзя менять', () => {
    const cancelled = must(changeFulfillmentStatus(make(), 'cancelled', T1))
    expect(changeFulfillmentStatus(cancelled, 'processing', T2).ok).toBe(false)
    expect(changePaymentStatus(cancelled, 'paid', T2).ok).toBe(false)
  })

  it('история только дополняется и сохраняет порядок', () => {
    let o = make()
    o = must(changePaymentStatus(o, 'pending', T1))
    o = must(addComment(o, 'Ждём перевод', T1))
    o = must(changeFulfillmentStatus(o, 'processing', T2))
    expect(o.history.map((e) => e.type)).toEqual(['created', 'payment_status', 'comment', 'fulfillment_status'])
    expect(new Set(o.history.map((e) => e.id)).size).toBe(4)
  })
})

describe('комментарии и выдача', () => {
  it('отклоняет пустой и слишком длинный комментарий', () => {
    const o = make()
    expect(addComment(o, '   ', T1).ok).toBe(false)
    expect(addComment(o, 'x'.repeat(2001), T1).ok).toBe(false)
    expect(addComment(o, ' ok ', T1).ok).toBe(true)
  })

  it('информация о выдаче сохраняется, а в истории только факт обновления', () => {
    const o = must(setDeliveryInfo(make(), 'секретная заметка', T1))
    expect(o.delivery).toEqual({ note: 'секретная заметка', updatedAt: T1 })
    expect(o.history.at(-1)?.type).toBe('delivery_info')
    expect(JSON.stringify(o.history)).not.toContain('секретная заметка')
  })

  it('не принимает неизменённый текст и правку в отменённом заказе', () => {
    const o = must(setDeliveryInfo(make(), 'a', T1))
    expect(setDeliveryInfo(o, 'a', T2).ok).toBe(false)
    const cancelled = must(changeFulfillmentStatus(make(), 'cancelled', T1))
    expect(setDeliveryInfo(cancelled, 'a', T2).ok).toBe(false)
  })
})

describe('список заказов: поиск, фильтры, сортировка', () => {
  const a = make([], [{ productId: 'steam-topup-1000', quantity: 1 }], 'Анна Демо', T0)
  const b0 = make([a], [{ productId: 'ai-claude-pro-1m', quantity: 1 }], 'Борис Демо', T1)
  const b = must(changePaymentStatus(b0, 'paid', T1))
  const c0 = make([a, b], [{ productId: 'apple-gift-card-5000', quantity: 2 }], 'Вера Демо', T2)
  const c = must(changeFulfillmentStatus(c0, 'cancelled', T2))
  const all = [a, b, c]

  it('ищет по номеру, имени, email и названию товара', () => {
    expect(filterOrders(all, { ...defaultOrderFilters, query: 'BZB-1002' })).toEqual([b])
    expect(filterOrders(all, { ...defaultOrderFilters, query: 'вера' })).toEqual([c])
    expect(filterOrders(all, { ...defaultOrderFilters, query: 'claude' })).toEqual([b])
    expect(filterOrders(all, { ...defaultOrderFilters, query: 'demo@example.com' })).toHaveLength(3)
    expect(filterOrders(all, { ...defaultOrderFilters, query: 'нет-такого' })).toEqual([])
  })

  it('фильтрует по статусам', () => {
    expect(filterOrders(all, { ...defaultOrderFilters, payment: 'paid' })).toEqual([b])
    expect(filterOrders(all, { ...defaultOrderFilters, fulfillment: 'cancelled' })).toEqual([c])
  })

  it('фильтрует по датам включительно', () => {
    const r = filterOrders(all, { ...defaultOrderFilters, dateFrom: '2026-10-11', dateTo: '2026-10-11' })
    expect(r).toEqual([b])
  })

  it('сортирует и не мутирует исходный массив', () => {
    expect(sortOrders(all, 'new').map((o) => o.number)).toEqual(['BZB-1003', 'BZB-1002', 'BZB-1001'])
    expect(sortOrders(all, 'old').map((o) => o.number)).toEqual(['BZB-1001', 'BZB-1002', 'BZB-1003'])
    expect(sortOrders(all, 'total-desc')[0]).toEqual(c)
    expect(sortOrders(all, 'total-asc')[0]).toEqual(a)
    expect(all.map((o) => o.number)).toEqual(['BZB-1001', 'BZB-1002', 'BZB-1003'])
  })

  it('считает сводку', () => {
    expect(orderStats(all)).toEqual({ total: 3, awaitingPayment: 1, toFulfil: 1, delivered: 0 })
  })
})

describe('данные из хранилища', () => {
  it('parseOrders отбрасывает мусор и оставляет корректные заказы', () => {
    const good = make()
    expect(parseOrders('мусор')).toEqual([])
    expect(parseOrders([good, null, { id: 1 }, { ...good, paymentStatus: 'hacked' }])).toEqual([good])
  })
})
