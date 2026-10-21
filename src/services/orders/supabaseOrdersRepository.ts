import type { Order } from '../../types'
import type { OrdersRepository } from './OrdersRepository'
import { requireSupabase } from '../supabase'

type DbOrder = Record<string, any>

function fromDb(row: DbOrder): Order {
  const meta = row.admin_metadata ?? {}
  const items = (row.order_items ?? []).map((i: DbOrder) => {
    const [title, platform = ''] = String(i.product_name).split(' · ')
    return { productId: i.product_id, title, platform: i.platform ?? platform, unitPrice: Number(i.unit_price), quantity: Number(i.quantity), ...(i.region ? { region: i.region } : {}) }
  })
  const status = row.status
  const fulfillmentStatus = status === 'confirmed' || status === 'processing' ? 'processing' : status === 'shipped' || status === 'completed' ? 'delivered' : status === 'cancelled' ? 'cancelled' : 'new'
  return {
    id: row.id, number: String(row.order_number), version: Number(row.version ?? 1), createdAt: row.created_at,
    updatedAt: row.updated_at, customer: { name: row.customer_name, email: row.customer_email ?? '', phone: row.customer_phone ?? '', address: row.delivery_address ?? '', comment: row.customer_comment ?? '' },
    consentAt: row.consent_at ?? undefined, items, total: Number(row.total_amount), currency: 'RUB', paymentStatus: 'unpaid', fulfillmentStatus,
    delivery: { note: meta.delivery?.note ?? '', updatedAt: meta.delivery?.updatedAt }, history: Array.isArray(meta.history) && meta.history.length ? meta.history : [{ id: `${row.id}-created`, type: 'created', at: row.created_at, actor: 'Покупатель', text: 'Заказ оформлен на сайте. Оплата не подключена.' }], isDemo: false, source: 'checkout',
  }
}

export const supabaseOrdersRepository: OrdersRepository = {
  kind: 'remote',
  async list() {
    const { data, error } = await requireSupabase().from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(fromDb)
  },
  async get(id) { return (await this.list()).find((o) => o.id === id) ?? null },
  async save(order) {
    const db = requireSupabase()
    const { data: { user } } = await db.auth.getUser()
    const status = order.fulfillmentStatus === 'processing' || order.fulfillmentStatus === 'awaiting_supplier' ? 'processing' : order.fulfillmentStatus === 'delivered' ? 'shipped' : order.fulfillmentStatus === 'cancelled' ? 'cancelled' : 'new'
    const history = order.history.map((event, index) => index === order.history.length - 1 && event.actor.includes('демо') ? { ...event, actor: user?.email ?? user?.id ?? 'Администратор' } : event)
    const { data, error } = await db.from('orders').update({ status, version: order.version, admin_metadata: { history, delivery: order.delivery }, updated_at: new Date().toISOString() }).eq('id', order.id).eq('version', order.version - 1).select('id').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Заказ уже изменён в другой сессии. Обновите страницу и повторите действие.')
  },
}
