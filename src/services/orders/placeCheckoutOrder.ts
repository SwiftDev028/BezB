import { getProduct } from '../../data/products'
import type { CartItem, Order, Result } from '../../types'
import { buildCheckoutOrder } from '../../utils/checkout'
import { ordersRepository } from './index'
import type { OrdersRepository } from './OrdersRepository'

/** Очередь: «прочитать список → назначить номер → сохранить» выполняется строго по одному оформлению. */
let queue: Promise<unknown> = Promise.resolve()

/**
 * Оформление заказа покупателем. Работает через тот же репозиторий, что и админка, поэтому при подключении
 * backend достаточно заменить реализацию репозитория (номер и цены тогда должен назначать сервер).
 * Никогда не бросает исключение: ошибка хранилища возвращается как `{ ok: false }`, и заказ не считается созданным.
 */
export function placeCheckoutOrder(
  cart: CartItem[],
  customer: { name: string; email: string },
  repo: OrdersRepository = ordersRepository,
): Promise<Result<Order>> {
  const run = queue.then(() => place(cart, customer, repo))
  queue = run.catch(() => undefined)
  return run
}

async function place(
  cart: CartItem[],
  customer: { name: string; email: string },
  repo: OrdersRepository,
): Promise<Result<Order>> {
  try {
    // Список читается непосредственно перед сохранением. Очередь выше защищает от гонки внутри вкладки;
    // между вкладками гарантию даст только backend (номер назначает сервер — см. docs/BACKEND.md).
    const existing = await repo.list()
    const built = buildCheckoutOrder(cart, customer, existing, getProduct, new Date().toISOString())
    if (!built.ok) return built
    await repo.save(built.value)
    return built
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Не удалось сохранить заказ. Заказ не создан.',
    }
  }
}
