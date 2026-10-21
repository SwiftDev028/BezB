import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { parseIds, toggleId } from '../utils/cart'
import { useCatalog } from './CatalogContext'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface FavoritesContextValue {
  ids: string[]
  has: (id: string) => boolean
  toggle: (id: string) => void
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { getProduct } = useCatalog()
  const [stored, update] = useLocalStorage<string[]>('bezb:favorites', [], parseIds)
  const ids = useMemo(() => stored.filter((id) => getProduct(id)), [stored])

  const has = useCallback((id: string) => ids.includes(id), [ids])
  const toggle = useCallback((id: string) => update((prev) => toggleId(prev, id)), [update])

  const value = useMemo(() => ({ ids, has, toggle }), [ids, has, toggle])
  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites должен использоваться внутри FavoritesProvider')
  return ctx
}
