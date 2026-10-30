import type { Result, SupportMessage, SupportThread } from '../../types'
import type { SupportRepository } from './SupportRepository'
import { requireSupabase } from '../supabase'

type Row = Record<string, unknown>

function mapMessage(value: unknown): SupportMessage | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Row
  if (
    typeof row.id !== 'string' ||
    (row.sender_role !== 'customer' && row.sender_role !== 'manager') ||
    typeof row.body !== 'string' ||
    typeof row.created_at !== 'string'
  ) return null
  return {
    id: row.id,
    author: row.sender_role === 'manager' ? 'support' : 'customer',
    text: row.body,
    sentAt: row.created_at,
    readBySupport: Boolean(row.read_by_manager_at),
    readByCustomer: Boolean(row.read_by_customer_at),
  }
}

function mapThread(value: unknown): SupportThread | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Row
  if (
    typeof row.id !== 'string' ||
    typeof row.order_id !== 'string' ||
    typeof row.order_number !== 'string' ||
    typeof row.created_at !== 'string' ||
    (row.status !== 'open' && row.status !== 'closed') ||
    (row.items !== undefined && !Array.isArray(row.items)) ||
    (row.messages !== undefined && !Array.isArray(row.messages))
  ) return null
  const parsedItems = (Array.isArray(row.items) ? row.items : []).map((item): SupportThread['items'][number] | null => {
    if (!item || typeof item !== 'object') return null
    const line = item as Row
    if (
      typeof line.product_name !== 'string' ||
      typeof line.quantity !== 'number' ||
      typeof line.unit_price !== 'number'
    ) return null
    return {
      title: line.product_name,
      quantity: line.quantity,
      unitPrice: line.unit_price,
    }
  })
  if (parsedItems.some((item) => item === null)) return null
  const messages = (Array.isArray(row.messages) ? row.messages : []).map(mapMessage)
  if (messages.some((message) => message === null)) return null
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    lastMessageAt: typeof row.last_message_at === 'string' ? row.last_message_at : null,
    total: typeof row.total_amount === 'number' ? row.total_amount : 0,
    currency: 'RUB',
    items: parsedItems as SupportThread['items'],
    demoPaymentAt: null,
    status: row.status,
    messages: messages as SupportMessage[],
    paymentStatus: typeof row.payment_status === 'string' ? row.payment_status : undefined,
    fulfillmentStatus: typeof row.fulfillment_status === 'string' ? row.fulfillment_status : undefined,
    customerName: typeof row.customer_name === 'string' ? row.customer_name : undefined,
    customerEmail: typeof row.customer_email === 'string' ? row.customer_email : undefined,
    unreadCount: typeof row.unread_count === 'number' ? row.unread_count : undefined,
    isGuest: typeof row.is_guest === 'boolean' ? row.is_guest : undefined,
    lastMessage: typeof row.last_message === 'string' ? row.last_message : null,
  }
}

function mapRpcError(error: { message?: string } | null): string | null {
  return error ? error.message || 'Ошибка обращения к поддержке.' : null
}

function failure<T>(error: { message?: string } | null, fallback: string): Result<T> | null {
  const message = mapRpcError(error)
  return message ? { ok: false, error: message || fallback } : null
}

function mappedThread(value: unknown): Result<SupportThread> {
  const thread = mapThread(value)
  return thread
    ? { ok: true, value: thread }
    : { ok: false, error: 'Сервер вернул некорректные данные обращения.' }
}

function mappedMessage(value: unknown): Result<SupportMessage> {
  const message = mapMessage(value)
  return message
    ? { ok: true, value: message }
    : { ok: false, error: 'Сервер вернул некорректные данные сообщения.' }
}

export const supabaseSupportRepository: SupportRepository = {
  kind: 'supabase',

  async registerOrder() {
    return { ok: false, error: 'Диалог создаётся атомарно вместе с заказом.' }
  },
  async confirmDemoPayment() {
    return { ok: false, error: 'Демо-оплата не используется для доступа к чату.' }
  },
  async getThread(orderId) {
    const result = await this.getCustomerThread(orderId)
    return result.ok ? { ok: true, value: result.value } : result
  },
  async listThreads() {
    return this.listAdminThreads()
  },
  async sendMessage(orderId, author, text) {
    return author === 'support'
      ? this.sendAdminMessage(orderId, text).then((result) => {
          if (!result.ok) return result
          return this.getAdminThread(orderId)
        })
      : this.sendCustomerMessage(orderId, undefined, text).then((result) => {
          if (!result.ok) return result
          return this.getCustomerThread(orderId)
        })
  },
  async markCustomerMessagesRead(orderId) {
    const result = await this.getAdminThread(orderId)
    return result
  },
  async setStatus(orderId, status) {
    const result = await this.setAdminStatus(orderId, status)
    return result.ok ? this.getAdminThread(orderId) : result
  },

  async getCustomerThread(orderId, guestToken) {
    const { data, error } = await requireSupabase().rpc('support_customer_get_thread', {
      p_order_id: orderId,
      p_guest_token: guestToken ?? null,
    })
    const err = failure<SupportThread>(error, 'Не удалось загрузить чат.')
    return err ?? mappedThread(data)
  },

  async sendCustomerMessage(orderId, guestToken, text) {
    const { data, error } = await requireSupabase().rpc('support_customer_send_message', {
      p_order_id: orderId,
      p_guest_token: guestToken ?? null,
      p_body: text,
    })
    const err = failure<SupportMessage>(error, 'Не удалось отправить сообщение.')
    return err ?? mappedMessage(data)
  },

  async markCustomerRead(orderId, guestToken) {
    const { error } = await requireSupabase().rpc('support_customer_mark_read', {
      p_order_id: orderId,
      p_guest_token: guestToken ?? null,
    })
    const err = failure<void>(error, 'Не удалось отметить сообщения прочитанными.')
    return err ?? { ok: true, value: undefined }
  },

  async listCustomerThreads() {
    const { data, error } = await requireSupabase().rpc('support_customer_list_threads')
    const err = failure<SupportThread[]>(error, 'Не удалось загрузить ваши обращения.')
    if (err) return err
    if (!Array.isArray(data)) return { ok: false, error: 'Сервер вернул некорректный список обращений.' }
    const threads = data.map(mapThread)
    return threads.some((thread) => thread === null)
      ? { ok: false, error: 'Сервер вернул некорректные данные обращения.' }
      : { ok: true, value: threads as SupportThread[] }
  },

  async listAdminThreads() {
    const { data, error } = await requireSupabase().rpc('support_admin_list_threads')
    const err = failure<SupportThread[]>(error, 'Не удалось загрузить обращения.')
    if (err) return err
    if (!Array.isArray(data)) return { ok: false, error: 'Сервер вернул некорректный список обращений.' }
    const threads = data.map(mapThread)
    return threads.some((thread) => thread === null)
      ? { ok: false, error: 'Сервер вернул некорректные данные обращения.' }
      : { ok: true, value: threads as SupportThread[] }
  },

  async getAdminThread(orderId) {
    const { data, error } = await requireSupabase().rpc('support_admin_get_thread', { p_order_id: orderId })
    const err = failure<SupportThread>(error, 'Не удалось открыть обращение.')
    return err ?? mappedThread(data)
  },

  async sendAdminMessage(orderId, text) {
    const { data, error } = await requireSupabase().rpc('support_admin_send_message', {
      p_order_id: orderId,
      p_body: text,
    })
    const err = failure<SupportMessage>(error, 'Не удалось отправить ответ.')
    return err ?? mappedMessage(data)
  },

  async setAdminStatus(orderId, status) {
    const { error } = await requireSupabase().rpc('support_admin_set_status', {
      p_order_id: orderId,
      p_status: status,
    })
    const err = failure<void>(error, 'Не удалось изменить статус обращения.')
    return err ?? { ok: true, value: undefined }
  },

  async revokeGuestAccess(orderId) {
    const { error } = await requireSupabase().rpc('support_admin_revoke_guest_access', { p_order_id: orderId })
    const err = failure<void>(error, 'Не удалось отозвать ссылку доступа.')
    return err ?? { ok: true, value: undefined }
  },

  async reissueGuestAccess(orderId) {
    const { data, error } = await requireSupabase().rpc('support_admin_reissue_guest_access', { p_order_id: orderId })
    const err = failure<string>(error, 'Не удалось выпустить новую ссылку доступа.')
    if (err) return err
    return typeof data === 'string'
      ? { ok: true, value: data }
      : { ok: false, error: 'Сервер не вернул токен доступа.' }
  },

  async sendDeliveredCodes(orderId) {
    const { data, error } = await requireSupabase().rpc('support_admin_send_delivered_codes', { p_order_id: orderId })
    const err = failure<SupportMessage>(error, 'Не удалось отправить цифровую выдачу.')
    return err ?? mappedMessage(data)
  },
}
