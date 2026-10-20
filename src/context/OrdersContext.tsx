import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getProduct } from '../data/products'
import { ordersRepository } from '../services/orders'
import type { Order, Result } from '../types'
import { createOrder, type NewOrderInput } from '../utils/orders'

interface OrdersContextValue {
  orders: Order[]
  loading: boolean
  /** Ошибка загрузки (не путать с ошибками отдельных операций — они возвращаются как Result) */
  loadError: string | null
  storageKind: 'local-demo' | 'remote'
  /** Применяет чистую функцию-преобразование к заказу и сохраняет результат */
  update: (id: string, change: (order: Order, nowIso: string) => Result<Order>) => Promise<Result<Order>>
  create: (input: NewOrderInput) => Promise<Result<Order>>
  resetDemo: () => Promise<void>
}

const OrdersContext = createContext<OrdersContextValue | null>(null)

const nowIso = () => new Date().toISOString()

/** Подключается только внутри админки — публичная часть сайта о заказах ничего не знает. */
export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const latest = useRef<Order[]>([])
  latest.current = orders

  useEffect(() => {
    let cancelled = false
    ordersRepository
      .list()
      .then((list) => {
        if (!cancelled) setOrders(list)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить заказы.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = useCallback(async (next: Order): Promise<Result<Order>> => {
    try {
      await ordersRepository.save(next)
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Не удалось сохранить заказ.' }
    }
    setOrders((prev) => (prev.some((o) => o.id === next.id) ? prev.map((o) => (o.id === next.id ? next : o)) : [...prev, next]))
    return { ok: true, value: next }
  }, [])

  const update = useCallback<OrdersContextValue['update']>(
    async (id, change) => {
      const current = latest.current.find((o) => o.id === id)
      if (!current) return { ok: false, error: 'Заказ не найден.' }
      const changed = change(current, nowIso())
      return changed.ok ? persist(changed.value) : changed
    },
    [persist],
  )

  const create = useCallback<OrdersContextValue['create']>(
    async (input) => {
      const made = createOrder(input, latest.current, getProduct, nowIso())
      return made.ok ? persist(made.value) : made
    },
    [persist],
  )

  const resetDemo = useCallback(async () => {
    if (ordersRepository.resetDemo) setOrders(await ordersRepository.resetDemo())
  }, [])

  const value = useMemo(
    () => ({ orders, loading, loadError, storageKind: ordersRepository.kind, update, create, resetDemo }),
    [orders, loading, loadError, update, create, resetDemo],
  )
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

export function useOrders(): OrdersContextValue {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders должен использоваться внутри OrdersProvider')
  return ctx
}
