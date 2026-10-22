import { describe, expect, it } from 'vitest'
import { makeProduct } from '../test/factories'
import { defaultFilters, filterProducts } from './catalog'
import { activeFilters, buildFacets, priceBounds, sanitizeFilters } from './facets'
import type { CatalogFilters } from '../types'

const f = (patch: Partial<CatalogFilters>): CatalogFilters => ({ ...defaultFilters, category: 'apple', ...patch })

const apple = [
  makeProduct({ id: 'a1', country: 'Турция', denomination: 100, denominationCurrency: 'TRY', price: 300 }),
  makeProduct({ id: 'a2', country: 'Турция', denomination: 500, denominationCurrency: 'TRY', price: 1400 }),
  makeProduct({ id: 'a3', country: 'США', denomination: 10, denominationCurrency: 'USD', price: 1100 }),
  makeProduct({ id: 'a4', country: 'США', denomination: 25, denominationCurrency: 'USD', price: 2600 }),
  makeProduct({ id: 'a5', country: 'Россия', denomination: 1000, denominationCurrency: 'RUB', price: 1100 }),
  makeProduct({ id: 'a6', country: 'Казахстан', denomination: 5000, denominationCurrency: 'KZT', price: 900 }),
]
const xbox = [
  makeProduct({ id: 'x1', category: 'xbox', type: 'game', platform: 'Xbox', brand: 'Xbox', price: 3000 }),
  makeProduct({ id: 'x2', category: 'xbox', type: 'subscription', platform: 'Xbox', brand: 'Xbox', price: 900 }),
]
const all = [...apple, ...xbox]

const facet = (list: ReturnType<typeof buildFacets>, id: string) => list.find((x) => x.id === id)

describe('фильтры по реальным характеристикам', () => {
  it('Apple: показывает регион, но не фильтр номинала', () => {
    const facets = buildFacets(all, f({}), 'apple')
    expect(facets.map((x) => x.id)).toEqual(['region'])
    expect(facet(facets, 'region')!.options.map((o) => o.value).sort()).toEqual(['Казахстан', 'Россия', 'США', 'Турция'])
    expect(apple.every((p) => p.denomination !== null)).toBe(true)
  })

  it('выбранный регион сохраняет варианты с их номиналами, не предлагая фасет номинала', () => {
    const facets = buildFacets(all, f({ region: 'Турция' }), 'apple')
    expect(facet(facets, 'region')!.selected).toBe('Турция')
    expect(facets.map((x) => x.id)).toEqual(['region'])
  })

  it('не показывает характеристику с единственным значением', () => {
    const oneRegion = apple.map((p) => ({ ...p, country: 'Россия' }))
    const facets = buildFacets(oneRegion, f({}), 'apple')
    expect(facet(facets, 'region')).toBeUndefined()
  })

  it('у других категорий свой набор: тип, а не регион Apple', () => {
    const facets = buildFacets(all, { ...defaultFilters, category: 'xbox' }, 'xbox')
    expect(facets.map((x) => x.id)).toEqual(['type'])
    expect(facets[0].options.map((o) => o.value).sort()).toEqual(['game', 'subscription'])
  })

  it('в общем каталоге есть категория', () => {
    expect(buildFacets(all, defaultFilters, 'all').map((x) => x.id)).toContain('category')
  })

  it('фильтры работают вместе', () => {
    const res = filterProducts(all, f({ region: 'Турция', minPrice: 1000 }))
    expect(res.map((p) => p.id)).toEqual(['a2'])
  })

  it('цена: границы считаются по остальным фильтрам', () => {
    expect(priceBounds(all, f({ region: 'США' }))).toEqual({ min: 1100, max: 2600 })
    expect(priceBounds([], f({}))).toBeNull()
  })

  it('убирает регион, которого нет в ассортименте', () => {
    const next = sanitizeFilters(all, f({ region: 'Марс' }), 'apple')
    expect(next.region).toBe('all')
  })

  it('пока каталог пуст, выбор из ссылки не теряется', () => {
    const filters = f({ region: 'Турция' })
    expect(sanitizeFilters([], filters, 'apple')).toEqual(filters)
  })

  it('активные фильтры и сброс отдельных пунктов', () => {
    const filters = f({ region: 'Турция', minPrice: 200, maxPrice: 900, query: 'карта' })
    const facets = buildFacets(all, filters, 'apple')
    const list = activeFilters(filters, facets, { query: true })
    expect(list.map((x) => x.key)).toEqual(['q', 'region', 'price'])
    expect(list.find((x) => x.key === 'price')!.patch).toEqual({ minPrice: null, maxPrice: null })
    expect(activeFilters(filters, facets).some((x) => x.key === 'q')).toBe(false)
  })
})
