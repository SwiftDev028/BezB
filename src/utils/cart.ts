import type { CartItem, Product } from '../types'

export const MAX_QUANTITY = 10

export function lineKey(item: Pick<CartItem, 'productId' | 'region'>): string {
  return `${item.productId}::${item.region ?? ''}`
}

export function addItem(items: CartItem[], productId: string, region?: string, quantity = 1): CartItem[] {
  const key = lineKey({ productId, region })
  const existing = items.find((i) => lineKey(i) === key)
  if (existing) {
    return items.map((i) =>
      lineKey(i) === key ? { ...i, quantity: Math.min(MAX_QUANTITY, i.quantity + quantity) } : i,
    )
  }
  return [...items, { productId, region, quantity: Math.min(MAX_QUANTITY, Math.max(1, quantity)) }]
}

export function removeItem(items: CartItem[], key: string): CartItem[] {
  return items.filter((i) => lineKey(i) !== key)
}

/** Количество < 1 удаляет позицию. */
export function setQuantity(items: CartItem[], key: string, quantity: number): CartItem[] {
  if (quantity < 1) return removeItem(items, key)
  const q = Math.min(MAX_QUANTITY, Math.floor(quantity))
  return items.map((i) => (lineKey(i) === key ? { ...i, quantity: q } : i))
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0)
}

export function cartTotal(items: CartItem[], lookup: (id: string, region?: string) => Product | undefined): number {
  return items.reduce((sum, i) => {
    const p = lookup(i.productId, i.region ?? '')
    return p ? sum + p.price * i.quantity : sum
  }, 0)
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

/** Защита от испорченных данных в localStorage. */
export function parseCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []
  const result: CartItem[] = []
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as CartItem).productId === 'string' &&
      Number.isFinite((entry as CartItem).quantity)
    ) {
      const e = entry as CartItem
      result.push({
        productId: e.productId,
        quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.floor(e.quantity))),
        region: typeof e.region === 'string' ? e.region : undefined,
      })
    }
  }
  return result
}

export function parseIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}
