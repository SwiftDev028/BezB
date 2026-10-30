import { describe, expect, it } from 'vitest'
import {
  bestCosts, countByView, defaultAdminFilters, describeError, filterAdminProducts, isLive, margin, publishWarnings,
  slugify, suggestIds, validateProductForm, variantLabel, type AdminProduct, type ProductForm,
} from './adminCatalog'

const p = (o: Partial<AdminProduct>): AdminProduct => ({
  product_id: 'sku', region: '', slug: 'sku', group_id: 'g', title: 'Товар', brand: 'Brand', platform: null, category: 'apple',
  product_type: 'gift-card', denomination: null, denomination_currency: null, unit_price: 100, availability: 'in_stock',
  publication_status: 'published', image_url: null, description: null, activation_instructions: null, restrictions: [], ...o,
})

const form: ProductForm = {
  product_id: 'apple-100-try', slug: 'apple-100-try', group_id: '', title: 'Apple Gift Card', brand: 'Apple', platform: '', category: 'apple',
  product_type: 'gift-card', region: 'Турция', denomination: '100', denomination_currency: 'TRY', unit_price: '350', image_url: '',
  subscription_months: '', subscription_bonus_months: '', description: 'd', activation_instructions: 'i', restrictions: '', availability: 'in_stock', publication_status: 'draft',
}

describe('админка каталога: логика', () => {
  it('видимость для покупателей = опубликован и в наличии', () => {
    expect(isLive(p({}))).toBe(true)
    expect(isLive(p({ availability: 'out_of_stock' }))).toBe(false)
    expect(isLive(p({ publication_status: 'draft' }))).toBe(false)
  })

  it('slug и SKU из названия, региона и номинала', () => {
    expect(slugify('Подарочная карта Apple')).toBe('podarochnaya-karta-apple')
    expect(suggestIds('Apple Gift Card', 'Турция', '100', 'TRY').slug).toBe('apple-gift-card-turtsiya-100-try')
    expect(suggestIds('Xbox Game Pass Ultimate', '', '', '', '12', '1').slug).toBe('xbox-game-pass-ultimate-12-months-bonus-1')
    expect(suggestIds('Claude Pro', '', '', '', '1').product_id).toBe('claude-pro-1-months')
    expect(suggestIds('Claude Max 5x', '', '', '', '1').product_id).toBe('claude-max-5x-1-months')
    expect(suggestIds('Claude Max 20x', '', '', '', '1').product_id).toBe('claude-max-20x-1-months')
  })

  it('поиск по SKU, региону и номиналу, фильтр по статусу', () => {
    const rows = [
      p({ product_id: 'a1', title: 'Apple Gift Card', region: 'Турция', denomination: 100, denomination_currency: 'TRY' }),
      p({ product_id: 'a2', title: 'Apple Gift Card', region: 'США', publication_status: 'draft' }),
      p({ product_id: 'x1', title: 'Game Pass', category: 'xbox', availability: 'out_of_stock' }),
    ]
    expect(filterAdminProducts(rows, { ...defaultAdminFilters, query: 'турция 100' }).map((r) => r.product_id)).toEqual(['a1'])
    expect(filterAdminProducts(rows, { ...defaultAdminFilters, view: 'draft' }).map((r) => r.product_id)).toEqual(['a2'])
    expect(filterAdminProducts(rows, { ...defaultAdminFilters, category: 'xbox' }).map((r) => r.product_id)).toEqual(['x1'])
    expect(countByView(rows)).toMatchObject({ all: 3, live: 1, draft: 1, no_stock: 1 })
    expect(variantLabel(rows[0])).toBe('Турция · 100 TRY')
  })

  it('себестоимость: лучшая рублёвая закупка активного поставщика и маржа', () => {
    const costs = bestCosts([
      { product_id: 'a', region: '', purchase_cost: 80, purchase_currency: 'RUB', purchase_cost_status: 'confirmed', suppliers: { name: 'A', status: 'active' } },
      { product_id: 'a', region: '', purchase_cost: 70, purchase_currency: 'RUB', purchase_cost_status: 'confirmed', suppliers: { name: 'B', status: 'active' } },
      { product_id: 'a', region: '', purchase_cost: 10, purchase_currency: 'RUB', purchase_cost_status: 'confirmed', suppliers: { name: 'C', status: 'inactive' } },
      { product_id: 'a', region: '', purchase_cost: 1, purchase_currency: 'USD', purchase_cost_status: 'confirmed', suppliers: { name: 'D', status: 'active' } },
      { product_id: 'a', region: '', purchase_cost: 2, purchase_currency: 'RUB', purchase_cost_status: 'estimate', suppliers: null },
      { product_id: 'a', region: '', purchase_cost: 1, purchase_currency: 'RUB', purchase_cost_status: 'estimated', suppliers: null },
      { product_id: 'c', region: '', purchase_cost: 75, purchase_currency: 'RUB', purchase_cost_status: 'confirmed', suppliers: null },
      { product_id: 'b', region: '', purchase_cost: 3, purchase_currency: 'RUB', purchase_cost_status: 'unverified', suppliers: null },
    ])
    expect(costs.get('a|')).toMatchObject({ cost: 70, supplier: 'B' })
    expect(margin(100, costs.get('a|'))).toEqual({ profit: 30, percent: 30 })
    expect(costs.get('a|')?.status).toBe('confirmed')
    expect(costs.get('c|')).toMatchObject({ cost: 75, supplier: '', status: 'confirmed' })
    expect(costs.has('b|')).toBe(false)
    expect(margin(100, { cost: 1, currency: 'USD', supplier: '', status: 'confirmed' })).toBeNull()
  })

  it('проверка формы', () => {
    expect(validateProductForm(form)).toEqual({})
    expect(validateProductForm({ ...form, product_type: 'subscription', subscription_months: '12', subscription_bonus_months: '1' })).toEqual({})
    expect(validateProductForm({ ...form, product_type: 'subscription', subscription_months: '1.5' })).toHaveProperty('subscription_months')
    expect(validateProductForm({ ...form, product_type: 'subscription', subscription_bonus_months: '1' })).toHaveProperty('subscription_months')
    const bad = validateProductForm({ ...form, title: ' ', unit_price: '0', slug: 'Bad Slug', denomination_currency: '', image_url: 'http://x' })
    expect(Object.keys(bad).sort()).toEqual(['denomination_currency', 'image_url', 'slug', 'title', 'unit_price'])
  })

  it('предупреждения перед публикацией', () => {
    const published = { ...form, publication_status: 'published' as const, unit_price: '60' }
    const w = publishWarnings(published, { cost: 70, currency: 'RUB', supplier: 'B', status: 'confirmed' })
    expect(w.some((x) => x.includes('изображения'))).toBe(true)
    expect(w.some((x) => x.includes('без прибыли'))).toBe(true)
    expect(publishWarnings(form, undefined)).toEqual([])
  })

  it('ошибки базы переводятся на понятный язык', () => {
    expect(describeError({ code: '23505', message: 'dup' }, 'x')).toMatch(/уже существует/)
    expect(describeError({ message: 'boom' }, 'x')).toBe('boom')
    expect(describeError(null, 'запасной')).toBe('запасной')
  })
})
