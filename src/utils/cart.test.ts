import { describe, expect, it } from 'vitest'
import { products, getProduct } from '../data/products'
import {
  MAX_QUANTITY,
  addItem,
  cartCount,
  cartTotal,
  lineKey,
  parseCartItems,
  removeItem,
  setQuantity,
  toggleId,
} from './cart'

describe('корзина', () => {
  it('добавляет новую позицию', () => {
    const items = addItem([], 'steam-topup-500')
    expect(items).toEqual([{ productId: 'steam-topup-500', region: undefined, quantity: 1 }])
  })

  it('увеличивает количество у существующей позиции', () => {
    const items = addItem(addItem([], 'steam-topup-500'), 'steam-topup-500')
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe(2)
  })

  it('разные регионы — разные позиции', () => {
    const items = addItem(addItem([], 'apple-gift-card-1000', 'США'), 'apple-gift-card-1000', 'Турция')
    expect(items).toHaveLength(2)
  })

  it('не превышает максимальное количество', () => {
    let items = addItem([], 'steam-topup-500', undefined, MAX_QUANTITY)
    items = addItem(items, 'steam-topup-500')
    expect(items[0].quantity).toBe(MAX_QUANTITY)
  })

  it('удаляет позицию по ключу', () => {
    const items = addItem(addItem([], 'a'), 'b')
    expect(removeItem(items, lineKey({ productId: 'a' })).map((i) => i.productId)).toEqual(['b'])
  })

  it('setQuantity меняет количество, а значение меньше 1 удаляет позицию', () => {
    const items = addItem([], 'a')
    const key = lineKey({ productId: 'a' })
    expect(setQuantity(items, key, 4)[0].quantity).toBe(4)
    expect(setQuantity(items, key, 0)).toEqual([])
  })

  it('считает количество товаров', () => {
    const items = setQuantity(addItem(addItem([], 'a'), 'b'), lineKey({ productId: 'a' }), 3)
    expect(cartCount(items)).toBe(4)
  })

  it('считает демонстрационную сумму', () => {
    const a = products[0]
    const b = products[1]
    let items = addItem([], a.id)
    items = addItem(items, a.id)
    items = addItem(items, b.id)
    expect(cartTotal(items, getProduct)).toBe(a.price * 2 + b.price)
  })

  it('игнорирует неизвестные товары при подсчёте суммы', () => {
    expect(cartTotal(addItem([], 'нет-такого'), getProduct)).toBe(0)
  })

  it('toggleId добавляет и убирает id', () => {
    expect(toggleId([], 'x')).toEqual(['x'])
    expect(toggleId(['x'], 'x')).toEqual([])
  })

  it('parseCartItems отбрасывает испорченные данные', () => {
    expect(parseCartItems('мусор')).toEqual([])
    expect(
      parseCartItems([{ productId: 'a', quantity: 2 }, { productId: 5, quantity: 1 }, null, { productId: 'b', quantity: 999 }]),
    ).toEqual([
      { productId: 'a', quantity: 2, region: undefined },
      { productId: 'b', quantity: MAX_QUANTITY, region: undefined },
    ])
  })
})
