import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CartItem, Order } from '../../types'
import type { OrdersRepository } from './OrdersRepository'
import type { Product } from '../../types'
import { buildCheckoutRpcItems, parseCheckoutRpcResponse, placeCheckoutOrder } from './placeCheckoutOrder'

const { rpc, requireSupabase } = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireSupabase: vi.fn(() => ({ rpc })),
}))

vi.mock('../supabase', () => ({
  supabaseConfigured: true,
  requireSupabase,
}))

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
const customer = { name: 'Иван Демо', email: 'ivan@example.com', phone: '+7 999 123-45-67', consent: true }
const customerWithoutPhone = { name: 'Иван Демо', email: 'ivan@example.com', consent: true }
const remoteRepo: OrdersRepository = {
  kind: 'remote',
  async list() { return [] },
  async get() { return null },
  async save() {},
}

describe('оформление через репозиторий', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('сохраняет заказ в репозитории и возвращает его', async () => {
    const repo = memoryRepo()
    const r = await placeCheckoutOrder(cart, customer, repo)
    expect(r.ok).toBe(true)
    expect(repo.data).toHaveLength(1)
    expect(repo.data[0].paymentStatus).toBe('pending')
    expect(repo.data[0].fulfillmentStatus).toBe('new')
    expect(requireSupabase).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
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
    expect((await placeCheckoutOrder(cart, { name: '', email: '', phone: '+7 999 123-45-67' }, repo)).ok).toBe(false)
    expect(repo.data).toHaveLength(0)
  })

  it('не создаёт заказ без обязательного согласия', async () => {
    const repo = memoryRepo()
    const result = await placeCheckoutOrder(cart, { ...customer, consent: false }, repo)

    expect(result).toEqual({ ok: false, error: 'Подтвердите согласие с условиями.' })
    expect(repo.data).toHaveLength(0)
    expect(requireSupabase).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

})

const regionalProducts: Product[] = [
  { id: 'gift-card', slug: 'gift-us', title: 'Gift Card', category: 'apple', platform: 'Gift Card', type: 'gift-card', price: 1000, currency: 'RUB', description: '', delivery: '', restrictions: [], available: true, popularity: 0, addedAt: '', tags: [], country: 'US' },
  { id: 'gift-card', slug: 'gift-tr', title: 'Gift Card', category: 'apple', platform: 'Gift Card', type: 'gift-card', price: 350, currency: 'RUB', description: '', delivery: '', restrictions: [], available: true, popularity: 0, addedAt: '', tags: [], country: 'TR' },
]
const regionalLookup = (id: string, region?: string) => regionalProducts.find((product) => product.id === id && (product.country ?? '') === region)

describe('checkout RPC payload', () => {
  beforeEach(() => {
    const stored = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => stored.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
      removeItem: vi.fn((key: string) => stored.delete(key)),
    })
    rpc.mockResolvedValue({
      data: {
        id: 'remote-order-id',
        order_number: 'BZB-2001',
        created_at: '2026-10-29T10:00:00.000Z',
        consent_at: '2026-10-29T10:00:00.000Z',
        total_amount: 100,
        guest_access_token: 'a'.repeat(64),
        items: [],
      },
      error: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the price for the selected regional variant', () => {
    expect(buildCheckoutRpcItems([{ productId: 'gift-card', region: 'TR', quantity: 2 }], regionalLookup)).toEqual([
      { product_id: 'gift-card', quantity: 2, region: 'TR', expected_price: 350 },
    ])
  })

  it('does not invent a price when the chosen region cannot be resolved', () => {
    expect(buildCheckoutRpcItems([{ productId: 'gift-card', region: 'JP', quantity: 1 }], regionalLookup)[0].expected_price).toBeNull()
  })

  it('returns a failure for a Supabase RPC error instead of a success-shaped order', () => {
    expect(parseCheckoutRpcResponse(null, { message: 'price changed' })).toEqual({ ok: false, error: 'price changed' })
    expect(parseCheckoutRpcResponse(null, null)).toEqual({ ok: false, error: 'Сервер не вернул подтверждение создания заказа.' })
  })

  it('sends null phone to guest checkout RPC when omitted', async () => {
    await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo)

    expect(rpc).toHaveBeenCalledWith('place_public_order_with_support', expect.objectContaining({
      p_customer_phone: null,
      p_idempotency_key: expect.any(String),
    }))
  })

  it('sends the normalized phone to guest checkout RPC when provided', async () => {
    const result = await placeCheckoutOrder(cart, { ...customer, phone: ' +7 999 123-45-67 ' }, remoteRepo)

    expect(rpc).toHaveBeenCalledWith('place_public_order_with_support', expect.objectContaining({
      p_customer_phone: customer.phone,
      p_idempotency_key: expect.any(String),
    }))
    expect(result.ok && result.value.supportAccessToken).toBe('a'.repeat(64))
  })

  it('reuses the same guest idempotency key for an identical retry and clears it after success', async () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => stored.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
      removeItem: vi.fn((key: string) => stored.delete(key)),
    })
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Network error' } })
      .mockResolvedValueOnce({
        data: {
          id: 'remote-order-id',
          order_number: 'BZB-2001',
          created_at: '2026-10-29T10:00:00.000Z',
          consent_at: '2026-10-29T10:00:00.000Z',
          total_amount: 100,
          guest_access_token: 'b'.repeat(64),
          items: [],
        },
        error: null,
      })

    const lookup = () => ({ ...regionalProducts[0], price: 100 })
    const first = await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo, lookup)
    const storedDuringRetry = JSON.stringify([...stored.values()])
    const second = await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo, lookup)
    const calls = rpc.mock.calls.filter(([name]) => name === 'place_public_order_with_support')

    expect(first.ok).toBe(false)
    expect(calls).toHaveLength(2)
    expect(calls[0][1].p_idempotency_key).toMatch(/^[0-9a-f-]{36}$/i)
    expect(calls[1][1].p_idempotency_key).toBe(calls[0][1].p_idempotency_key)
    expect(calls[0][1].p_items[0].expected_price).toBe(100)
    expect(calls[1][1].p_items[0].expected_price).toBe(100)
    expect(second.ok && second.value.supportAccessToken).toBe('b'.repeat(64))
    expect(storedDuringRetry).not.toContain(customerWithoutPhone.email)
    expect(storedDuringRetry).not.toContain(customerWithoutPhone.name)
    expect(stored.has('bezb:checkout-request')).toBe(false)
    vi.unstubAllGlobals()
  })

  it('uses a different idempotency key if the transmitted price changes', async () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => stored.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
      removeItem: vi.fn((key: string) => stored.delete(key)),
    })
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'Network error' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'Network error' } })

    await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo, () => ({ ...regionalProducts[0], price: 100 }))
    await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo, () => ({ ...regionalProducts[0], price: 200 }))
    const calls = rpc.mock.calls.filter(([name]) => name === 'place_public_order_with_support')

    expect(calls[0][1].p_items[0].expected_price).toBe(100)
    expect(calls[1][1].p_items[0].expected_price).toBe(200)
    expect(calls[1][1].p_idempotency_key).not.toBe(calls[0][1].p_idempotency_key)
  })

  it('does not send a guest checkout request if the retry key cannot be persisted', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('Storage disabled') }),
      removeItem: vi.fn(),
    })

    const result = await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo)

    expect(result).toEqual({
      ok: false,
      error: 'Не удалось безопасно сохранить запрос оформления. Разрешите хранилище сессии и повторите попытку.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends null phone to buyer checkout RPC when omitted', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    const result = await placeCheckoutOrder(cart, customerWithoutPhone, remoteRepo, undefined, 'verified-user-id')

    expect(rpc).toHaveBeenCalledWith('place_buyer_order_with_support', expect.objectContaining({
      p_customer_phone: null,
    }))
    expect(result.ok && result.value.supportAccessToken).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('sends the normalized phone to buyer checkout RPC when provided', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    await placeCheckoutOrder(cart, { ...customer, phone: ' +7 999 123-45-67 ' }, remoteRepo, undefined, 'verified-user-id')

    expect(rpc).toHaveBeenCalledWith('place_buyer_order_with_support', expect.objectContaining({
      p_customer_phone: customer.phone,
    }))
    vi.unstubAllGlobals()
  })
})
