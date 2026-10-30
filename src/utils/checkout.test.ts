import { describe, expect, it } from 'vitest'
import { getProduct, products } from '../data/products'
import type { CartItem, Order, Product } from '../types'
import { MAX_NAME, buildCheckoutOrder, validateCheckout } from './checkout'

describe('проверка формы оформления', () => {
  it('принимает корректные данные', () => {
    expect(validateCheckout('Иван', 'ivan@example.com', true)).toEqual({})
  })

  it('находит все ошибки', () => {
    const errors = validateCheckout('', 'не-email', false)
    expect(errors.name).toBeDefined()
    expect(errors.email).toBeDefined()
    expect(errors.agree).toBeDefined()
  })

  it('требует email', () => {
    expect(validateCheckout('Иван', '  ', true).email).toBeDefined()
  })

  it('ограничивает длину имени и email', () => {
    expect(validateCheckout('x'.repeat(MAX_NAME + 1), 'a@example.com', true).name).toBeDefined()
    expect(validateCheckout('Иван', `${'a'.repeat(250)}@example.com`, true).email).toBeDefined()
  })

})

const customer = { name: '  Иван Демо ', email: ' ivan@example.com ' }
const T = '2026-10-20T10:00:00.000Z'

describe('заказ из корзины', () => {
  const cart: CartItem[] = [
    { productId: 'steam-topup-1000', quantity: 2 },
    { productId: 'apple-gift-card-1000', quantity: 1, region: 'Турция' },
  ]

  it('создаёт заказ со статусами «Ожидает оплаты» и «Ожидает обработки»', () => {
    const r = buildCheckoutOrder(cart, customer, [], getProduct, T)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.paymentStatus).toBe('pending')
    expect(r.value.fulfillmentStatus).toBe('new')
    expect(r.value.source).toBe('checkout')
    expect(r.value.isDemo).toBe(true)
  })

  it('не помечает заказ оплаченным или выданным', () => {
    const r = buildCheckoutOrder(cart, customer, [], getProduct, T)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.paymentStatus).not.toBe('paid')
    expect(r.value.fulfillmentStatus).not.toBe('delivered')
    expect(r.value.history.map((e) => e.type)).toEqual(['created'])
  })

  it('сохраняет покупателя (без лишних пробелов), позиции, количество, регион и сумму', () => {
    const r = buildCheckoutOrder(cart, customer, [], getProduct, T)
    if (!r.ok) throw new Error(r.error)
    const steam = getProduct('steam-topup-1000')!
    const apple = getProduct('apple-gift-card-1000')!
    expect(r.value.customer).toEqual({ name: 'Иван Демо', email: 'ivan@example.com' })
    expect(r.value.items).toHaveLength(2)
    expect(r.value.items[0]).toMatchObject({ productId: steam.id, quantity: 2, unitPrice: steam.price })
    expect(r.value.items[1]).toMatchObject({ productId: apple.id, quantity: 1, region: 'Турция', unitPrice: apple.price })
    expect(r.value.total).toBe(steam.price * 2 + apple.price)
  })

  it('фиксирует цену на момент оформления — последующее изменение каталога её не меняет', () => {
    const steam = getProduct('steam-topup-1000')!
    const lookup = (id: string): Product | undefined => (id === steam.id ? { ...steam, price: 100 } : getProduct(id))
    const r = buildCheckoutOrder([{ productId: steam.id, quantity: 3 }], customer, [], lookup, T)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.items[0].unitPrice).toBe(100)
    expect(r.value.total).toBe(300)
    // каталог «изменился» — заказ остался прежним
    expect(steam.price).not.toBe(100)
    expect(r.value.total).toBe(300)
  })

  it('присваивает уникальные последовательные номера', () => {
    const orders: Order[] = []
    for (let i = 0; i < 5; i++) {
      const r = buildCheckoutOrder(cart, customer, orders, getProduct, T)
      if (!r.ok) throw new Error(r.error)
      orders.push(r.value)
    }
    expect(new Set(orders.map((o) => o.number)).size).toBe(5)
    expect(new Set(orders.map((o) => o.id)).size).toBe(5)
    expect(orders.map((o) => o.number)).toEqual(['BZB-1001', 'BZB-1002', 'BZB-1003', 'BZB-1004', 'BZB-1005'])
  })

  it('отклоняет пустую корзину', () => {
    const r = buildCheckoutOrder([], customer, [], getProduct, T)
    expect(r).toEqual({ ok: false, error: 'Корзина пуста.' })
  })

  it('отклоняет некорректные данные покупателя', () => {
    expect(buildCheckoutOrder(cart, { name: '', email: 'a@example.com' }, [], getProduct, T).ok).toBe(false)
    expect(buildCheckoutOrder(cart, { name: 'Иван', email: 'не-email' }, [], getProduct, T).ok).toBe(false)
  })

  it('отклоняет товар не в наличии, неизвестный товар и отсутствие региона', () => {
    const unavailable = products.find((p) => !p.available)!
    const a = buildCheckoutOrder([{ productId: unavailable.id, quantity: 1 }], customer, [], getProduct, T)
    expect(a.ok).toBe(false)
    expect(buildCheckoutOrder([{ productId: 'нет-такого', quantity: 1 }], customer, [], getProduct, T).ok).toBe(false)
    expect(buildCheckoutOrder([{ productId: 'apple-gift-card-1000', quantity: 1 }], customer, [], getProduct, T).ok).toBe(false)
    expect(buildCheckoutOrder([{ productId: 'apple-gift-card-1000', quantity: 1, region: 'Марс' }], customer, [], getProduct, T).ok).toBe(false)
  })

  it('не мутирует переданную корзину и список заказов', () => {
    const existing: Order[] = []
    const snapshot = JSON.stringify(cart)
    buildCheckoutOrder(cart, customer, existing, getProduct, T)
    expect(JSON.stringify(cart)).toBe(snapshot)
    expect(existing).toEqual([])
  })
})
