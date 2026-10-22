import type { CatalogFilters, Product, SortKey } from '../types'

export const defaultFilters: CatalogFilters = {
  query: '',
  category: 'all',
  type: 'all',
  platform: 'all',
  region: 'all',
  brand: 'all',
  minPrice: null,
  maxPrice: null,
  onlyAvailable: false,
  sort: 'popular',
}

export const sortLabels: Record<SortKey, string> = {
  popular: 'По популярности',
  'price-asc': 'Сначала дешевле',
  'price-desc': 'Сначала дороже',
  new: 'Сначала новинки',
  title: 'По названию',
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').trim()
}

function monthWord(count: number): string {
  const lastTwo = count % 100
  const last = count % 10
  if (lastTwo >= 11 && lastTwo <= 14) return 'месяцев'
  if (last === 1) return 'месяц'
  if (last >= 2 && last <= 4) return 'месяца'
  return 'месяцев'
}

export function subscriptionTerm(product: Pick<Product, 'subscriptionMonths' | 'subscriptionBonusMonths'>): string | null {
  if (!product.subscriptionMonths || product.subscriptionMonths < 1) return null
  const base = `${product.subscriptionMonths} ${monthWord(product.subscriptionMonths)}`
  const bonus = product.subscriptionBonusMonths ?? 0
  return bonus > 0 ? `${base} + ${bonus} бонусн${bonus === 1 ? 'ый' : 'ых'} ${monthWord(bonus)}` : base
}

/** Все слова запроса должны встретиться в названии, описании, платформе или тегах. */
export function matchesQuery(product: Product, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalize(
    [product.title, product.description, product.platform, ...product.tags].join(' '),
  )
  return words.every((w) => haystack.includes(w))
}

export function sortProducts(list: Product[], sort: SortKey): Product[] {
  const copy = [...list]
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return copy.sort((a, b) => b.price - a.price)
    case 'new':
      return copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
    case 'popular':
    default:
      return copy.sort((a, b) => b.popularity - a.popularity)
  }
}

export function filterProducts(products: Product[], filters: CatalogFilters): Product[] {
  const filtered = products.filter((p) => {
    if (filters.category !== 'all' && p.category !== filters.category) return false
    if (filters.type !== 'all' && p.type !== filters.type) return false
    if (filters.platform !== 'all' && p.platform !== filters.platform) return false
    if (filters.region !== 'all' && (p.country ?? '') !== filters.region) return false
    if (filters.brand !== 'all' && (p.brand ?? '') !== filters.brand) return false
    if (filters.minPrice !== null && p.price < filters.minPrice) return false
    if (filters.maxPrice !== null && p.price > filters.maxPrice) return false
    if (filters.onlyAvailable && !p.available) return false
    return matchesQuery(p, filters.query)
  })
  return sortProducts(filtered, filters.sort)
}

export function uniquePlatforms(products: Product[]): string[] {
  return [...new Set(products.map((p) => p.platform))].sort((a, b) => a.localeCompare(b, 'ru'))
}

export function suggest(products: Product[], query: string, limit = 5): Product[] {
  if (normalize(query).length < 2) return []
  return sortProducts(
    products.filter((p) => matchesQuery(p, query)),
    'popular',
  ).slice(0, limit)
}

export function relatedProducts(products: Product[], product: Product, limit = 4): Product[] {
  return sortProducts(
    products.filter((p) => p.id !== product.id && p.category === product.category),
    'popular',
  ).slice(0, limit)
}
