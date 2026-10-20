import type { Order } from '../../types'

/**
 * Единственная точка доступа админки к заказам.
 * Сейчас реализован localStorage (демо). Позже добавляется HttpOrdersRepository,
 * который обращается к backend, и меняется одна строка в `services/orders/index.ts`.
 * Интерфейс асинхронный намеренно: так UI не придётся переписывать.
 */
export interface OrdersRepository {
  /** `local-demo` — данные только в этом браузере; `remote` — настоящий backend. */
  readonly kind: 'local-demo' | 'remote'
  list(): Promise<Order[]>
  get(id: string): Promise<Order | null>
  /**
   * Создаёт или заменяет заказ. Backend обязан сравнивать `version` и отклонять
   * изменение устаревшей копии (иначе два администратора затрут правки друг друга).
   */
  save(order: Order): Promise<void>
  /** Только для демо: вернуть тестовые данные в исходное состояние. */
  resetDemo?(): Promise<Order[]>
}
