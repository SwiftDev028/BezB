import type { CatalogFilters, CategoryId, ProductType, SortKey } from '../types'
import { defaultFilters } from './catalog'

const categoryIds: CategoryId[] = ['apple', 'xbox', 'playstation', 'steam', 'ai']
const typeIds: ProductType[] = ['gift-card', 'game', 'subscription', 'topup']
const sortKeys: SortKey[] = ['popular', 'price-asc', 'price-desc', 'new', 'title']

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function filtersFromParams(params: URLSearchParams, fixedCategory?: CategoryId): CatalogFilters {
  const cat = params.get('cat')
  const type = params.get('type')
  const sort = params.get('sort')
  return {
    query: params.get('q') ?? '',
    category: fixedCategory ?? (categoryIds.includes(cat as CategoryId) ? (cat as CategoryId) : 'all'),
    type: typeIds.includes(type as ProductType) ? (type as ProductType) : 'all',
    platform: params.get('platform') ?? 'all',
    minPrice: parseNumber(params.get('min')),
    maxPrice: parseNumber(params.get('max')),
    onlyAvailable: params.get('avail') === '1',
    sort: sortKeys.includes(sort as SortKey) ? (sort as SortKey) : defaultFilters.sort,
  }
}

/** В URL попадают только значения, отличающиеся от значений по умолчанию. */
export function filtersToParams(filters: CatalogFilters, fixedCategory?: CategoryId): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.query.trim()) params.set('q', filters.query)
  if (!fixedCategory && filters.category !== 'all') params.set('cat', filters.category)
  if (filters.type !== 'all') params.set('type', filters.type)
  if (filters.platform !== 'all') params.set('platform', filters.platform)
  if (filters.minPrice !== null) params.set('min', String(filters.minPrice))
  if (filters.maxPrice !== null) params.set('max', String(filters.maxPrice))
  if (filters.onlyAvailable) params.set('avail', '1')
  if (filters.sort !== defaultFilters.sort) params.set('sort', filters.sort)
  return params
}
