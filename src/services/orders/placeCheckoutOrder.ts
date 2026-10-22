import { getProduct } from '../../data/products'
import type { CartItem, Order, Result } from '../../types'
import { buildCheckoutOrder } from '../../utils/checkout'
import { ordersRepository } from './index'
import type { OrdersRepository } from './OrdersRepository'
import { requireSupabase, supabaseConfigured } from '../supabase'
import type { Product } from '../../types'

/** Очередь: «прочитать список → назначить номер → сохранить» выполняется строго по одному оформлению. */
let queue: Promise<unknown> = Promise.resolve()

export function buildCheckoutRpcItems(
  cart: CartItem[],
  lookup: (id: string, region?: string) => Product | undefined,
) {
  return cart.map((item) => ({
    product_id: item.productId,
    quantity: item.quantity,
    region: item.region ?? null,
    expected_price: lookup(item.productId, item.region ?? '')?.price ?? null,
  }))
}

export function parseCheckoutRpcResponse(
  data: unknown,
  error: { message?: string } | null,
): Result<Record<string, unknown>> {
  if (error) return { ok: false, error: error.message || 'Не удалось отправить заказ.' }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'Сервер не вернул подтверждение создания заказа.' }
  }
  const row = data as Record<string, unknown>
  if (!row.id || !row.order_number || !Array.isArray(row.items)) {
    return { ok: false, error: 'Сервер не вернул подтверждение создания заказа.' }
  }
  return { ok: true, value: row }
}

/**
 * Оформление заказа покупателем. Работает через тот же репозиторий, что и админка, поэтому при подключении
 * С Supabase заказ создаётся RPC, которая проверяет каталог, владельца аккаунта и назначает номер/цены на сервере.
 * Никогда не бросает исключение: ошибка хранилища возвращается как `{ ok: false }`, и заказ не считается созданным.
 */
export function placeCheckoutOrder(
  cart: CartItem[],
  customer: { name: string; email: string; phone?: string; comment?: string; consent?: boolean },
  repo: OrdersRepository = ordersRepository,
  lookup: (id: string, region?: string) => Product | undefined = getProduct,
  customerUserId?: string,
): Promise<Result<Order>> {
  if (supabaseConfigured) return placeRemote(cart, { ...customer, consent: Boolean(customer.consent) }, lookup, customerUserId)
  const run = queue.then(() => place(cart, customer, repo, lookup))
  queue = run.catch(() => undefined)
  return run
}

function checkoutRequestKey(cart: CartItem[], email: string): { fingerprint: string; key: string } {
  const fingerprint = JSON.stringify([email.toLowerCase(), [...cart].sort((a,b)=>a.productId.localeCompare(b.productId)).map(i=>[i.productId,i.quantity,i.region ?? ''])])
  const storageKey = 'bezb:checkout-request'
  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as { fingerprint?: string; key?: string } | null
    if (previous?.fingerprint === fingerprint && previous.key) return { fingerprint, key: previous.key }
    const key = crypto.randomUUID()
    sessionStorage.setItem(storageKey, JSON.stringify({ fingerprint, key }))
    return { fingerprint, key }
  } catch { return { fingerprint, key: crypto.randomUUID() } }
}

async function placeRemote(cart: CartItem[], customer: { name: string; email: string; phone?: string; comment?: string; consent: boolean }, lookup: (id: string, region?: string) => Product | undefined, customerUserId?: string): Promise<Result<Order>> {
  try {
    const items = buildCheckoutRpcItems(cart, lookup)
    const client = requireSupabase()
    const request = customerUserId ? checkoutRequestKey(cart, customer.email) : null
    const { data, error } = customerUserId
      ? await client.rpc('place_buyer_order', {
          p_customer_name: customer.name, p_customer_phone: customer.phone ?? '', p_customer_email: customer.email,
          // Deprecated RPC parameter retained for migration compatibility; digital orders have no address.
          p_delivery_address: null, p_customer_comment: customer.comment ?? '', p_consent: customer.consent,
          p_items: items, p_idempotency_key: request!.key,
        })
      : await client.rpc('place_public_order', {
          p_customer_name: customer.name, p_customer_phone: customer.phone ?? '', p_customer_email: customer.email,
          // Deprecated RPC parameter retained for migration compatibility; digital orders have no address.
          p_delivery_address: null, p_customer_comment: customer.comment ?? '', p_consent: customer.consent,
          p_items: items,
        })
    const response = parseCheckoutRpcResponse(data, error)
    if (!response.ok) return response
    const row = response.value as Record<string, any>
    const order: Order = {
      id: row.id, number: row.order_number, version: 1, createdAt: row.created_at, updatedAt: row.created_at,
      customer: { name: customer.name.trim(), email: customer.email.trim(), phone: customer.phone, comment: customer.comment },
      consentAt: row.consent_at, items: (row.items ?? []).map((item: any) => ({ productId: item.product_id, title: item.product_name, platform: item.platform, unitPrice: Number(item.unit_price), quantity: Number(item.quantity), ...(item.region ? { region: item.region } : {}), denomination:item.denomination == null ? null : Number(item.denomination), denominationCurrency:item.denomination_currency ?? null, subscriptionMonths:item.subscription_months == null ? null : Number(item.subscription_months), subscriptionBonusMonths:Number(item.subscription_bonus_months ?? 0) })),
      total: Number(row.total_amount), currency: 'RUB', paymentStatus: 'unpaid', fulfillmentStatus: 'new', delivery: { note: '' },
      history: [{ id: `${row.id}-created`, type: 'created', at: row.created_at, actor: 'Покупатель', text: 'Заказ оформлен на сайте. Оплата не подключена.' }], isDemo: false, source: 'checkout',
    }
    if (customerUserId) try { sessionStorage.removeItem('bezb:checkout-request') } catch { /* session storage is optional */ }
    return { ok: true, value: order }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Не удалось отправить заказ.' } }
}

async function place(
  cart: CartItem[],
  customer: { name: string; email: string },
  repo: OrdersRepository,
  lookup: (id: string, region?: string) => Product | undefined,
): Promise<Result<Order>> {
  try {
    // Список читается непосредственно перед сохранением. Очередь выше защищает от гонки внутри вкладки;
    // между вкладками гарантию даст только backend (номер назначает сервер — см. docs/BACKEND.md).
    const existing = await repo.list()
    const built = buildCheckoutOrder(cart, customer, existing, lookup, new Date().toISOString())
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
