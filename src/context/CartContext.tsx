import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import type { CartItem } from '../types'
import { addItem, cartCount, cartTotal, parseCartItems, removeItem, setQuantity } from '../utils/cart'
import { useCatalog } from './CatalogContext'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface CartContextValue {
  items: CartItem[]
  count: number
  total: number
  add: (productId: string, region?: string) => void
  remove: (key: string) => void
  changeQuantity: (key: string, quantity: number) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const { getProduct } = useCatalog()
  const [items, update] = useLocalStorage<CartItem[]>('bezb:cart', [], parseCartItems)

  // Позиции, которых больше нет в каталоге, не учитываем и не показываем
  const validItems = useMemo(() => items.filter((i) => getProduct(i.productId, i.region ?? '')), [items, getProduct])

  const add = useCallback(
    (productId: string, region?: string) => update((prev) => addItem(prev, productId, region)),
    [update],
  )
  const remove = useCallback((key: string) => update((prev) => removeItem(prev, key)), [update])
  const changeQuantity = useCallback(
    (key: string, quantity: number) => update((prev) => setQuantity(prev, key, quantity)),
    [update],
  )
  const clear = useCallback(() => update(() => []), [update])

  const value = useMemo<CartContextValue>(
    () => ({
      items: validItems,
      count: cartCount(validItems),
      total: cartTotal(validItems, getProduct),
      add,
      remove,
      changeQuantity,
      clear,
    }),
    [validItems, getProduct, add, remove, changeQuantity, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart должен использоваться внутри CartProvider')
  return ctx
}
