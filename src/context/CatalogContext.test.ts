import { describe, expect, it } from 'vitest'
import { findCatalogProduct, mapCatalogRows } from './CatalogContext'

const row = (
  region: string,
  price: number,
  slug: string,
  denomination: number | null = 10,
  denominationCurrency: string | null = 'USD',
  title = 'Gift Card',
) => ({
  product_id: 'gift-card', group_id: 'gift-group', slug, title, platform: 'Gift Card',
  currency: 'RUB', unit_price: price, region, category: 'apple', product_type: 'gift-card',
  availability: 'in_stock', denomination, denomination_currency: denominationCurrency,
})

describe('regional catalog variants', () => {
  it('resolves a single variant without a region', () => {
    const products = mapCatalogRows([row('', 700, 'gift-card')])
    expect(findCatalogProduct(products, 'gift-card')?.price).toBe(700)
    expect(findCatalogProduct(products, 'gift-card', '')?.country).toBeUndefined()
  })

  it('resolves a shared product ID by the selected region and keeps each price', () => {
    const products = mapCatalogRows([row('US', 1000, 'gift-card-us'), row('TR', 350, 'gift-card-tr')])
    expect(findCatalogProduct(products, 'gift-card', 'US')?.price).toBe(1000)
    expect(findCatalogProduct(products, 'gift-card', 'TR')?.price).toBe(350)
  })

  it('returns no variant when the requested region is absent', () => {
    const products = mapCatalogRows([row('US', 1000, 'gift-card-us'), row('TR', 350, 'gift-card-tr')])
    expect(findCatalogProduct(products, 'gift-card', 'JP')).toBeUndefined()
  })

  it('sorts numeric denominations ascending within each region and denomination currency', () => {
    const products = mapCatalogRows([
      row('USA', 1000, 'us-100-usd', 100, 'USD'),
      row('USA', 250, 'us-25-usd', 25, 'USD'),
      row('Turkey', 3000, 'tr-100-try', 100, 'TRY'),
      row('Turkey', 800, 'tr-25-try', 25, 'TRY'),
      row('USA', 500, 'us-50-eur', 50, 'EUR'),
    ])

    expect(products.map((product) => `${product.country}:${product.denominationCurrency}:${product.denomination}`)).toEqual([
      'Turkey:TRY:25',
      'Turkey:TRY:100',
      'USA:EUR:50',
      'USA:USD:25',
      'USA:USD:100',
    ])
  })

  it('keeps products without denominations alphabetically ordered and maps null values safely', () => {
    const products = mapCatalogRows([
      row('USA', 1000, 'us-100', 100, 'USD', 'Gift Card'),
      row('', 300, 'zeta', null, null, 'Zeta'),
      { ...row('', 200, 'beta', null, null, 'Beta'), denomination: undefined },
    ])

    expect(products.map((product) => product.title)).toEqual(['Gift Card', 'Beta', 'Zeta'])
    expect(products.slice(1).map((product) => product.denomination)).toEqual([null, null])
  })
})
