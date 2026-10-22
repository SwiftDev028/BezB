import type { Product } from '../types'

/** Фабрика тестовых товаров. Используется только в тестах — в каталог сайта эти данные не попадают. */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  const id = overrides.id ?? 'test-product'
  return {
    id,
    slug: overrides.slug ?? id,
    title: 'Тестовый товар',
    category: 'apple',
    platform: 'Apple',
    type: 'gift-card',
    price: 1000,
    currency: 'RUB',
    description: '',
    delivery: '',
    restrictions: [],
    available: true,
    popularity: 0,
    addedAt: '2026-10-01T00:00:00Z',
    tags: [],
    brand: 'Apple',
    ...overrides,
  }
}
