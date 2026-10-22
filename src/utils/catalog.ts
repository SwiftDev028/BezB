import type { CatalogFilters, Product, SortKey } from '../types'

export const defaultFilters: CatalogFilters = {
  query: '',
  category: 'all',
  type: 'all',
  platform: 'all',
  region: 'all',
  brand: 'all',
  denomination: 'all',
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

/** Ключ номинала: «100 TRY». У товаров без номинала — null. */
export function denominationKey(p: Product): string | null {
  if (p.denomination === null || p.denomination === undefined) return null
  return `${p.denomination} ${p.denominationCurrency ?? ''}`.trim()
}

export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').trim()
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
    if (filters.denomination !== 'all' && denominationKey(p) !== filters.denomination) return false
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
