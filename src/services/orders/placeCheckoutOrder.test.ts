import { describe, expect, it } from 'vitest'
import type { CartItem, Order } from '../../types'
import type { OrdersRepository } from './OrdersRepository'
import { placeCheckoutOrder } from './placeCheckoutOrder'

function memoryRepo(initial: Order[] = [], failSave = false): OrdersRepository & { data: Order[] } {
  const data = [...initial]
  return {
    kind: 'local-demo',
    data,
    async list() {
      return [...data]
    },
    async get(id) {
      return data.find((o) => o.id === id) ?? null
    },
    async save(order) {
      if (failSave) throw new Error('Не удалось сохранить данные: хранилище браузера недоступно или переполнено.')
      const i = data.findIndex((o) => o.id === order.id)
      if (i === -1) data.push(order)
      else data[i] = order
    },
  }
}

const cart: CartItem[] = [{ productId: 'steam-topup-500', quantity: 1 }]
const customer = { name: 'Иван Демо', email: 'ivan@example.com' }

describe('оформление через репозиторий', () => {
  it('сохраняет заказ в репозитории и возвращает его', async () => {
    const repo = memoryRepo()
    const r = await placeCheckoutOrder(cart, customer, repo)
    expect(r.ok).toBe(true)
    expect(repo.data).toHaveLength(1)
    expect(repo.data[0].paymentStatus).toBe('pending')
    expect(repo.data[0].fulfillmentStatus).toBe('new')
  })

  it('два оформления подряд получают разные номера', async () => {
    const repo = memoryRepo()
    const a = await placeCheckoutOrder(cart, customer, repo)
    const b = await placeCheckoutOrder(cart, customer, repo)
    if (!a.ok || !b.ok) throw new Error('ожидался успех')
    expect(a.value.number).not.toBe(b.value.number)
    expect(repo.data).toHaveLength(2)
  })

  it('параллельные оформления не теряют заказы и не получают одинаковый номер', async () => {
    const repo = memoryRepo()
    const results = await Promise.all([
      placeCheckoutOrder(cart, customer, repo),
      placeCheckoutOrder(cart, customer, repo),
      placeCheckoutOrder(cart, customer, repo),
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(repo.data).toHaveLength(3)
    expect(new Set(repo.data.map((o) => o.number)).size).toBe(3)
    expect(new Set(repo.data.map((o) => o.id)).size).toBe(3)
  })

  it('учитывает уже существующие заказы при нумерации', async () => {
    const first = await placeCheckoutOrder(cart, customer, memoryRepo())
    if (!first.ok) throw new Error('ожидался успех')
    const repo = memoryRepo([first.value])
    const next = await placeCheckoutOrder(cart, customer, repo)
    if (!next.ok) throw new Error('ожидался успех')
    expect(next.value.number).toBe('BZB-1002')
  })

  it('при ошибке хранилища возвращает ошибку и не создаёт заказ', async () => {
    const repo = memoryRepo([], true)
    const r = await placeCheckoutOrder(cart, customer, repo)
    expect(r.ok).toBe(false)
    expect(repo.data).toHaveLength(0)
    if (!r.ok) expect(r.error).toContain('хранилище')
  })

  it('пустая корзина и неверные данные не доходят до сохранения', async () => {
    const repo = memoryRepo()
    expect((await placeCheckoutOrder([], customer, repo)).ok).toBe(false)
    expect((await placeCheckoutOrder(cart, { name: '', email: '' }, repo)).ok).toBe(false)
    expect(repo.data).toHaveLength(0)
  })
})
