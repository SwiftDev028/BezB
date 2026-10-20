import { buildDemoOrders } from '../../data/demoOrders'
import type { Order } from '../../types'
import { parseOrders } from '../../utils/orders'
import type { OrdersRepository } from './OrdersRepository'

const KEY = 'bezb:admin:orders'

function read(): Order[] | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw === null ? null : parseOrders(JSON.parse(raw))
  } catch {
    return null
  }
}

function write(orders: Order[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(orders))
  } catch {
    throw new Error('Не удалось сохранить данные: хранилище браузера недоступно или переполнено.')
  }
}

/** Демо-хранилище: данные живут только в localStorage этого браузера и никуда не передаются. */
export const localOrdersRepository: OrdersRepository = {
  kind: 'local-demo',

  async list() {
    const stored = read()
    if (stored) return stored
    // Первый запуск (или хранилище повреждено) — заполняем тестовыми заказами
    const seed = buildDemoOrders()
    try {
      write(seed)
    } catch {
      /* работаем без сохранения */
    }
    return seed
  },

  async get(id) {
    return (await this.list()).find((o) => o.id === id) ?? null
  },

  async save(order) {
    const all = read() ?? []
    const index = all.findIndex((o) => o.id === order.id)
    if (index === -1) all.push(order)
    else all[index] = order
    write(all)
  },

  async resetDemo() {
    const seed = buildDemoOrders()
    write(seed)
    return seed
  },
}
