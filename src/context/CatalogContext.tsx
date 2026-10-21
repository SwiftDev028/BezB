import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Product, CategoryId, ProductType } from '../types'
import { requireSupabase, supabaseConfigured } from '../services/supabase'

interface CatalogValue { products: Product[]; loading: boolean; error: string | null; getProduct: (id: string, region?: string) => Product | undefined; refresh: () => Promise<void> }
const CatalogContext = createContext<CatalogValue | null>(null)

export function mapCatalogRows(rows: Record<string, any>[]): Product[] {
  const mapped = rows.map((row): Product => ({
    id: row.product_id, slug: row.slug, title: row.title, category: row.category as CategoryId,
    platform: row.platform || row.brand, type: row.product_type as ProductType, price: Number(row.unit_price),
    currency: 'RUB', description: row.description ?? '', delivery: row.activation_instructions ?? 'Инструкция появится после подтверждения заказа.',
    restrictions: Array.isArray(row.restrictions) ? row.restrictions : [], regions: undefined, available: row.availability === 'in_stock',
    popularity: Number(row.popularity ?? 0), addedAt: row.created_at ?? row.updated_at, tags: [row.brand, row.region].filter(Boolean),
    groupId: row.group_id, brand: row.brand, country: row.region || undefined,
    denomination: row.denomination == null ? null : Number(row.denomination), denominationCurrency: row.denomination_currency,
    imageUrl: row.image_url, activationInstructions: row.activation_instructions ?? '',
  }))
  const regionsByGroup = new Map<string, string[]>()
  for (const product of mapped) {
    if (!product.country || !product.groupId) continue
    const regions = regionsByGroup.get(product.groupId) ?? []
    if (!regions.includes(product.country)) regions.push(product.country)
    regionsByGroup.set(product.groupId, regions)
  }
  const withRegions = mapped.map((product) => ({ ...product, regions: product.groupId ? regionsByGroup.get(product.groupId) : undefined }))
  return sortCatalogProducts(withRegions)
}

function sortCatalogProducts(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    const aHasDenomination = typeof a.denomination === 'number' && Number.isFinite(a.denomination)
    const bHasDenomination = typeof b.denomination === 'number' && Number.isFinite(b.denomination)

    if (aHasDenomination !== bHasDenomination) return aHasDenomination ? -1 : 1
    if (!aHasDenomination || !bHasDenomination) return a.title.localeCompare(b.title, 'ru')

    const regionOrder = (a.country ?? '').localeCompare(b.country ?? '', 'ru')
    if (regionOrder !== 0) return regionOrder

    const currencyOrder = (a.denominationCurrency ?? '').localeCompare(b.denominationCurrency ?? '', 'ru')
    if (currencyOrder !== 0) return currencyOrder

    return a.denomination! - b.denomination! || a.title.localeCompare(b.title, 'ru')
  })
}

/** Resolve a catalog row by its variant ID/slug and, when supplied, exact region. */
export function findCatalogProduct(products: Product[], id: string, region?: string): Product | undefined {
  const matches = products.filter((product) => product.id === id || product.slug === id)
  if (region !== undefined) {
    const normalizedRegion = region.trim()
    return matches.find((product) => (product.country ?? '') === normalizedRegion)
  }
  const slugMatch = matches.find((product) => product.slug === id)
  if (slugMatch) return slugMatch
  return matches[0]
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestRequest = useRef(0)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++latestRequest.current
    if (!supabaseConfigured) {
      if (requestId === latestRequest.current && !signal?.aborted) { setError('Каталог Supabase не настроен.'); setLoading(false) }
      return
    }
    setLoading(true)
    try {
      let query = requireSupabase().from('catalog_public').select('*').order('title')
      if (signal) query = query.abortSignal(signal)
      const { data, error: queryError } = await query
      if (queryError) throw queryError
      if (requestId === latestRequest.current && !signal?.aborted) { setProducts(mapCatalogRows(data ?? [])); setError(null) }
    } catch (e) {
      if (requestId === latestRequest.current && !signal?.aborted) setError(e instanceof Error ? e.message : 'Не удалось загрузить каталог.')
    } finally {
      if (requestId === latestRequest.current && !signal?.aborted) setLoading(false)
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    return () => { controller.abort(); latestRequest.current += 1 }
  }, [refresh])
  const value = useMemo<CatalogValue>(() => ({ products, loading, error, getProduct: (id, region) => findCatalogProduct(products, id, region), refresh: () => refresh() }), [products, loading, error, refresh])
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const value = useContext(CatalogContext)
  if (!value) throw new Error('useCatalog должен использоваться внутри CatalogProvider')
  return value
}
