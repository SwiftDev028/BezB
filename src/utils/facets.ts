import type { CatalogFilters, CategoryId, Product, ProductType } from '../types'
import { categories, typeLabels } from '../data/categories'
import { defaultFilters, filterProducts } from './catalog'

/** Характеристики, по которым можно фильтровать. Цена и сортировка — отдельно. */
export type FacetId = 'category' | 'type' | 'brand' | 'platform' | 'region'

export interface FacetOption {
  value: string
  label: string
  count: number
}

export interface Facet {
  id: FacetId
  label: string
  options: FacetOption[]
  selected: string
}

export const facetLabels: Record<FacetId, string> = {
  category: 'Категория',
  type: 'Тип товара',
  brand: 'Сервис',
  platform: 'Платформа',
  region: 'Регион',
}

/**
 * Какие характеристики вообще имеют смысл в разделе. Показываются только те, у которых
 * в текущем ассортименте есть из чего выбирать (два и больше значения).
 * Порядок — порядок появления на экране.
 */
export const facetsByScope: Record<CategoryId | 'all', FacetId[]> = {
  apple: ['region'],
  xbox: ['type', 'platform', 'region'],
  playstation: ['type', 'platform', 'region'],
  steam: ['type', 'region'],
  ai: ['brand', 'type', 'region'],
  all: ['category', 'type', 'region'],
}

const facetKey: Record<FacetId, keyof CatalogFilters> = {
  category: 'category',
  type: 'type',
  brand: 'brand',
  platform: 'platform',
  region: 'region',
}

function valueOf(p: Product, id: FacetId): string | null {
  switch (id) {
    case 'category':
      return p.category
    case 'type':
      return p.type
    case 'brand':
      return p.brand || null
    case 'platform':
      return p.platform || null
    case 'region':
      return p.country || null
  }
}

function labelOf(id: FacetId, value: string): string {
  if (id === 'type') return typeLabels[value as ProductType] ?? value
  if (id === 'category') return categories.find((c) => c.id === value)?.title ?? value
  return value
}

function compareOptions(_id: FacetId, a: FacetOption, b: FacetOption): number {
  return a.label.localeCompare(b.label, 'ru')
}

/** Все фильтры, кроме перечисленных, — нужны, чтобы считать варианты «остальные фильтры уже применены». */
function withoutFacets(filters: CatalogFilters, ids: FacetId[]): CatalogFilters {
  const next = { ...filters }
  for (const id of ids) (next[facetKey[id]] as string) = defaultFilters[facetKey[id]] as string
  return next
}

/**
 * Варианты каждой характеристики считаются по товарам, которые подходят под ВСЕ ОСТАЛЬНЫЕ фильтры.
 * Значения, которых в ассортименте нет, не появляются.
 */
export function buildFacets(products: Product[], filters: CatalogFilters, scope: CategoryId | 'all'): Facet[] {
  const ids = facetsByScope[scope]
  const result: Facet[] = []
  for (const id of ids) {
    if (id === 'category' && scope !== 'all') continue
    const base = filterProducts(products, withoutFacets({ ...filters, sort: 'popular' }, [id]))
    const counts = new Map<string, number>()
    for (const p of base) {
      const v = valueOf(p, id)
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    const selected = filters[facetKey[id]] as string
    // Единственный вариант выбирать не из чего. Исключение — уже выбранный: его нужно уметь снять.
    if (counts.size < 2 && selected === 'all') continue
    if (selected !== 'all' && !counts.has(selected)) counts.set(selected, 0)
    const options = [...counts].map(([value, count]) => ({ value, label: labelOf(id, value), count }))
    options.sort((a, b) => compareOptions(id, a, b))
    result.push({ id, label: facetLabels[id], options, selected })
  }
  return result
}

/** Границы цены среди товаров, подходящих под все фильтры, кроме цены. */
export function priceBounds(products: Product[], filters: CatalogFilters): { min: number; max: number } | null {
  const base = filterProducts(products, { ...filters, minPrice: null, maxPrice: null, sort: 'popular' })
  if (base.length === 0) return null
  const prices = base.map((p) => p.price)
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/**
 * Убирает выбранные значения, которых больше нет в ассортименте. Выполняется после загрузки каталога;
 * пока данных нет, фильтры не трогаем.
 */
export function sanitizeFilters(products: Product[], filters: CatalogFilters, scope: CategoryId | 'all'): CatalogFilters {
  if (products.length === 0) return filters
  let current = filters
  for (let pass = 0; pass < 2; pass++) {
    for (const id of [...facetsByScope[scope]].reverse()) {
      const key = facetKey[id]
      const selected = current[key] as string
      if (selected === 'all') continue
      const base = filterProducts(products, withoutFacets({ ...current, sort: 'popular' }, [id]))
      if (!base.some((p) => valueOf(p, id) === selected)) current = withoutFacets(current, [id])
    }
  }
  return current
}

export interface ActiveFilter {
  key: string
  label: string
  /** Что нужно изменить в фильтрах, чтобы убрать этот пункт */
  patch: Partial<CatalogFilters>
}

export function activeFilters(filters: CatalogFilters, facets: Facet[], opts: { query?: boolean } = {}): ActiveFilter[] {
  const list: ActiveFilter[] = []
  if (opts.query && filters.query.trim()) list.push({ key: 'q', label: `Поиск: «${filters.query.trim()}»`, patch: { query: '' } })
  for (const facet of facets) {
    if (facet.selected === 'all') continue
    const option = facet.options.find((o) => o.value === facet.selected)
    list.push({
      key: facet.id,
      label: `${facet.label}: ${option?.label ?? facet.selected}`,
      patch: { [facetKey[facet.id]]: 'all' } as Partial<CatalogFilters>,
    })
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const from = filters.minPrice !== null ? `от ${filters.minPrice}` : ''
    const to = filters.maxPrice !== null ? `до ${filters.maxPrice}` : ''
    list.push({ key: 'price', label: `Цена: ${[from, to].filter(Boolean).join(' ')} ₽`, patch: { minPrice: null, maxPrice: null } })
  }
  return list
}
