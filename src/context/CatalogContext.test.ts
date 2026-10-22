import { describe, expect, it } from 'vitest'
import { findCatalogProduct, mapCatalogRows } from './CatalogContext'

const row = (region: string, price: number, slug: string) => ({
  product_id: 'gift-card', group_id: 'gift-group', slug, title: 'Gift Card', platform: 'Gift Card',
  currency: 'RUB', unit_price: price, region, category: 'apple', product_type: 'gift-card',
  availability: 'in_stock', denomination: 10, denomination_currency: 'USD',
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

  it('maps structured subscription terms from the public catalog rows', () => {
    const products = mapCatalogRows([{
      ...row('', 10990, 'game-pass-ultimate-12'),
      denomination: null,
      denomination_currency: null,
      product_type: 'subscription',
      subscription_months: 12,
      subscription_bonus_months: 1,
    }])
    expect(products[0]).toMatchObject({ subscriptionMonths: 12, subscriptionBonusMonths: 1, denomination: null })
  })
})
