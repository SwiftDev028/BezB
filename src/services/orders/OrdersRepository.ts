import type { Order } from '../../types'

/**
 * Единственная точка доступа админки к заказам.
 * Реализация выбирается из Supabase либо локального прототипа по наличию
 * публичных Vite настроек. Интерфейс асинхронный намеренно.
 */
export interface OrdersRepository {
  /** `local-demo` — данные только в этом браузере; `remote` — настоящий backend. */
  readonly kind: 'local-demo' | 'remote'
  list(): Promise<Order[]>
  get(id: string): Promise<Order | null>
  /**
   * Сохраняет заказ. Удалённая реализация отклоняет устаревшую `version`.
   */
  save(order: Order): Promise<void>
  /** Только для демо: вернуть тестовые данные в исходное состояние. */
  resetDemo?(): Promise<Order[]>
}
