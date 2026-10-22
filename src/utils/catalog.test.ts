import { describe, expect, it } from 'vitest'
import { subscriptionTerm } from './catalog'
import { products } from '../data/products'
import { defaultFilters, filterProducts, matchesQuery, sortProducts, suggest } from './catalog'
import type { CatalogFilters } from '../types'

const f = (patch: Partial<CatalogFilters>): CatalogFilters => ({ ...defaultFilters, ...patch })

describe('каталог', () => {
  it('форматирует структурированный срок и бонусные месяцы, не читая denomination', () => {
    expect(subscriptionTerm({ subscriptionMonths: 1, subscriptionBonusMonths: 0 })).toBe('1 месяц')
    expect(subscriptionTerm({ subscriptionMonths: 3, subscriptionBonusMonths: 0 })).toBe('3 месяца')
    expect(subscriptionTerm({ subscriptionMonths: 12, subscriptionBonusMonths: 1 })).toBe('12 месяцев + 1 бонусный месяц')
    expect(subscriptionTerm({ subscriptionMonths: null, subscriptionBonusMonths: 0 })).toBeNull()
  })

  it('без фильтров возвращает все товары', () => {
    expect(filterProducts(products, defaultFilters)).toHaveLength(products.length)
  })

  it('фильтрует по категории', () => {
    const result = filterProducts(products, f({ category: 'steam' }))
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((p) => p.category === 'steam')).toBe(true)
  })

  it('фильтрует по типу товара', () => {
    const result = filterProducts(products, f({ type: 'subscription' }))
    expect(result.every((p) => p.type === 'subscription')).toBe(true)
  })

  it('фильтрует по диапазону цены', () => {
    const result = filterProducts(products, f({ minPrice: 1000, maxPrice: 2000 }))
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((p) => p.price >= 1000 && p.price <= 2000)).toBe(true)
  })

  it('скрывает товары не в наличии', () => {
    const result = filterProducts(products, f({ onlyAvailable: true }))
    expect(result.every((p) => p.available)).toBe(true)
    expect(result.length).toBeLessThan(products.length)
  })

  it('ищет без учёта регистра и по нескольким словам', () => {
    const result = filterProducts(products, f({ query: 'CLAUDE pro' }))
    expect(result.map((p) => p.slug)).toContain('ai-claude-pro-1m')
  })

  it('поиск считает «ё» и «е» одинаковыми', () => {
    const p = { ...products[0], title: 'Кошелёк', tags: [] }
    expect(matchesQuery(p, 'кошелек')).toBe(true)
  })

  it('возвращает пустой список, если ничего не найдено', () => {
    expect(filterProducts(products, f({ query: 'zzzzqqqq' }))).toEqual([])
  })

  it('сортирует по цене', () => {
    const asc = sortProducts(products, 'price-asc').map((p) => p.price)
    expect(asc).toEqual([...asc].sort((a, b) => a - b))
    const desc = sortProducts(products, 'price-desc').map((p) => p.price)
    expect(desc).toEqual([...desc].sort((a, b) => b - a))
  })

  it('сортировка не изменяет исходный массив', () => {
    const before = products.map((p) => p.id)
    sortProducts(products, 'price-desc')
    expect(products.map((p) => p.id)).toEqual(before)
  })

  it('сортирует новинки по дате добавления', () => {
    const dates = sortProducts(products, 'new').map((p) => p.addedAt)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('подсказки не появляются для слишком короткого запроса', () => {
    expect(suggest(products, 'a')).toEqual([])
    expect(suggest(products, 'steam').length).toBeGreaterThan(0)
  })
})

describe('данные каталога', () => {
  it('slug уникальны', () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length)
  })

  it('у скидочных товаров старая цена выше текущей', () => {
    for (const p of products.filter((x) => x.oldPrice)) {
      expect(p.oldPrice!).toBeGreaterThan(p.price)
    }
  })
})
