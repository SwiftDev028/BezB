import { getProduct } from './products'
import type { Order, Result } from '../types'
import {
  addComment,
  changeFulfillmentStatus,
  changePaymentStatus,
  createOrder,
  setDeliveryInfo,
} from '../utils/orders'

/**
 * ДЕМОНСТРАЦИОННЫЕ заказы для первого запуска админки. Покупатели вымышлены (@example.com),
 * история собрана теми же функциями, что работают в интерфейсе, — поэтому всегда согласована.
 */
export function buildDemoOrders(): Order[] {
  const orders: Order[] = []

  const add = (
    name: string,
    lines: { productId: string; quantity: number; region?: string }[],
    at: string,
    steps: ((o: Order) => Result<Order>)[] = [],
  ) => {
    const created = createOrder({ customer: { name, email: `${name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '') || 'client'}@example.com` }, lines }, orders, getProduct, at, 'Демо-заказ (тестовые данные)')
    if (!created.ok) throw new Error(created.error)
    let o = created.value
    for (const step of steps) {
      const r = step(o)
      if (!r.ok) throw new Error(`demoOrders ${o.number}: ${r.error}`)
      o = r.value
    }
    orders.push(o)
  }

  const day = (d: number, h = 12) => `2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00.000Z`

  add('Demo Anna', [{ productId: 'steam-topup-1000', quantity: 2 }], day(12, 9), [
    (o) => changePaymentStatus(o, 'paid', day(12, 10), 'Оплата отмечена вручную (демо)'),
    (o) => changeFulfillmentStatus(o, 'processing', day(12, 11)),
    (o) => setDeliveryInfo(o, 'Демо: товар выдан покупателю по email, получение подтверждено.', day(12, 13)),
    (o) => changeFulfillmentStatus(o, 'delivered', day(12, 14)),
    (o) => addComment(o, 'Покупатель подтвердил получение.', day(12, 15)),
  ])

  add('Demo Boris', [{ productId: 'ai-claude-pro-1m', quantity: 1 }], day(15, 11), [
    (o) => changePaymentStatus(o, 'paid', day(15, 12), 'Оплата отмечена вручную (демо)'),
    (o) => changeFulfillmentStatus(o, 'processing', day(15, 13)),
    (o) => addComment(o, 'Уточняем у покупателя, на какой аккаунт оформлять подписку.', day(15, 14)),
  ])

  add('Demo Vera', [{ productId: 'apple-gift-card-5000', quantity: 1, region: 'США' }], day(17, 10))

  add('Demo Gleb', [{ productId: 'ps-plus-extra-3m', quantity: 1 }], day(17, 16), [
    (o) => changePaymentStatus(o, 'pending', day(17, 17), 'Ждём подтверждения перевода'),
  ])

  add('Demo Dina', [{ productId: 'xbox-game-pass-ultimate-1m', quantity: 1 }], day(18, 9), [
    (o) => changePaymentStatus(o, 'failed', day(18, 10), 'Платёж не прошёл (демо)'),
    (o) => changeFulfillmentStatus(o, 'cancelled', day(18, 11), 'Покупатель не повторил оплату'),
  ])

  add('Demo Egor', [{ productId: 'xbox-neon-riot', quantity: 1 }, { productId: 'steam-topup-500', quantity: 1 }], day(19, 8), [
    (o) => changePaymentStatus(o, 'paid', day(19, 9)),
    (o) => changeFulfillmentStatus(o, 'awaiting_supplier', day(19, 10), 'Запрошен ключ у поставщика'),
    (o) => addComment(o, 'Поставщик не подтвердил наличие. Предлагаем вернуть деньги.', day(19, 12)),
    (o) => changeFulfillmentStatus(o, 'cancelled', day(19, 13)),
    (o) => changePaymentStatus(o, 'refunded', day(19, 14), 'Возврат оформлен (демо)'),
  ])

  return orders
}
