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
    denomination: row.denomination === null ? null : Number(row.denomination), denominationCurrency: row.denomination_currency,
    subscriptionMonths: row.subscription_months === null || row.subscription_months === undefined ? null : Number(row.subscription_months),
    subscriptionBonusMonths: Number(row.subscription_bonus_months ?? 0),
    imageUrl: row.image_url, activationInstructions: row.activation_instructions ?? '',
  }))
  const regionsByGroup = new Map<string, string[]>()
  for (const product of mapped) {
    if (!product.country || !product.groupId) continue
    const regions = regionsByGroup.get(product.groupId) ?? []
    if (!regions.includes(product.country)) regions.push(product.country)
    regionsByGroup.set(product.groupId, regions)
  }
  return mapped.map((product) => ({ ...product, regions: product.groupId ? regionsByGroup.get(product.groupId) : undefined }))
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
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Номер последнего запроса: ответ устаревшего запроса не должен перезаписать свежие данные
  const lastRequest = useRef(0)

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Каталог Supabase не настроен.')
      setFetching(false)
      return
    }
    const request = ++lastRequest.current
    setFetching(true)
    try {
      const { data, error: queryError } = await requireSupabase().from('catalog_public').select('*').order('title')
      if (queryError) throw queryError
      if (request !== lastRequest.current) return
      setProducts(mapCatalogRows(data ?? []))
      setLoadedOnce(true)
      setError(null)
    } catch (e) {
      if (request !== lastRequest.current) return
      setError(e instanceof Error ? e.message : 'Не удалось загрузить каталог.')
    } finally {
      if (request === lastRequest.current) setFetching(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      lastRequest.current++
    }
  }, [refresh])

  // «Загрузка» — пока нет данных. Фоновое обновление (например, после правки в админке) интерфейс не мигает.
  const loading = fetching && !loadedOnce
  const getProduct = useCallback((id: string, region?: string) => findCatalogProduct(products, id, region), [products])
  const value = useMemo<CatalogValue>(
    () => ({ products, loading, error, getProduct, refresh }),
    [products, loading, error, getProduct, refresh],
  )
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const value = useContext(CatalogContext)
  if (!value) throw new Error('useCatalog должен использоваться внутри CatalogProvider')
  return value
}
