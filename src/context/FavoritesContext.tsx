import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { parseIds, toggleId } from '../utils/cart'
import { useCatalog } from './CatalogContext'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface FavoritesContextValue {
  ids: string[]
  /** Каталог ещё грузится или не загрузился: список избранного пока нельзя показать целиком */
  pending: boolean
  /** Сколько товаров сохранено (включая ещё не сверенные с каталогом) */
  savedCount: number
  has: (id: string) => boolean
  toggle: (id: string) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { getProduct, loading, error } = useCatalog()
  const [stored, update] = useLocalStorage<string[]>('bezb:favorites', [], parseIds)
  // getProduct в зависимостях: после обновления страницы каталог приходит позже первого рендера
  const ids = useMemo(() => stored.filter((id) => getProduct(id)), [stored, getProduct])
  const pending = stored.length > 0 && (loading || Boolean(error)) && ids.length === 0

  const has = useCallback((id: string) => ids.includes(id), [ids])
  const toggle = useCallback((id: string) => update((prev) => toggleId(prev, id)), [update])

  const value = useMemo(
    () => ({ ids, pending, savedCount: stored.length, has, toggle }),
    [ids, pending, stored.length, has, toggle],
  )
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites должен использоваться внутри FavoritesProvider')
  return ctx
}
