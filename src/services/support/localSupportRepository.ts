import type {
  Result,
  SupportAuthor,
  SupportMessage,
  SupportOrderRegistration,
  SupportThread,
} from '../../types'
import type { SupportRepository } from './SupportRepository'

const STORAGE_KEY = 'bezb:support:threads'

function isThread(value: unknown): value is SupportThread {
  if (!value || typeof value !== 'object') return false
  const thread = value as Partial<SupportThread>
  return (
    typeof thread.orderId === 'string' &&
    typeof thread.orderNumber === 'string' &&
    typeof thread.createdAt === 'string' &&
    typeof thread.total === 'number' &&
    thread.currency === 'RUB' &&
    Array.isArray(thread.items) &&
    (thread.demoPaymentAt === null || typeof thread.demoPaymentAt === 'string') &&
    (thread.status === 'open' || thread.status === 'closed') &&
    Array.isArray(thread.messages) &&
    thread.items.every(
      (item) =>
        item &&
        typeof item.title === 'string' &&
        typeof item.quantity === 'number' &&
        typeof item.unitPrice === 'number',
    ) &&
    thread.messages.every(
      (message) =>
        message &&
        typeof message.id === 'string' &&
        (message.author === 'customer' || message.author === 'support') &&
        typeof message.text === 'string' &&
        typeof message.sentAt === 'string' &&
        typeof message.readBySupport === 'boolean',
    )
  )
}

function readThreads(): Result<SupportThread[]> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return { ok: true, value: [] }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every(isThread)) {
      return { ok: false, error: 'Локальные данные чата повреждены и не могут быть прочитаны.' }
    }
    return { ok: true, value: parsed }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Не удалось прочитать локальные обращения: ${error.message}` : 'Не удалось прочитать локальные обращения.',
    }
  }
}

function writeThreads(threads: SupportThread[]): Result<SupportThread[]> {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(threads))
    return { ok: true, value: threads }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? `Не удалось сохранить переписку: ${error.message}` : 'Не удалось сохранить переписку.',
    }
  }
}

function updateThread(
  orderId: string,
  change: (thread: SupportThread) => Result<SupportThread>,
): Result<SupportThread> {
  const current = readThreads()
  if (!current.ok) return current
  const index = current.value.findIndex((thread) => thread.orderId === orderId)
  if (index === -1) return { ok: false, error: 'Обращение для этого заказа не найдено в этом браузере.' }
  const changed = change(current.value[index])
  if (!changed.ok) return changed
  const threads = [...current.value]
  threads[index] = changed.value
  const saved = writeThreads(threads)
  return saved.ok ? { ok: true, value: changed.value } : saved
}

function makeMessage(author: SupportAuthor, text: string, sentAt: string): SupportMessage {
  return {
    id: crypto.randomUUID(),
    author,
    text,
    sentAt,
    readBySupport: author === 'support',
  }
}

export const localSupportRepository: SupportRepository = {
  kind: 'local-demo',

  async registerOrder(order: SupportOrderRegistration) {
    const current = readThreads()
    if (!current.ok) return current
    const existing = current.value.find((thread) => thread.orderId === order.orderId)
    if (existing) {
      if (existing.orderNumber !== order.orderNumber) {
        return { ok: false, error: 'Идентификатор заказа уже связан с другой локальной перепиской.' }
      }
      return { ok: true, value: existing }
    }
    const thread: SupportThread = {
      ...order,
      items: order.items.map((item) => ({ ...item })),
      demoPaymentAt: null,
      status: 'open',
      messages: [],
    }
    const saved = writeThreads([...current.value, thread])
    return saved.ok ? { ok: true, value: thread } : saved
  },

  async confirmDemoPayment(orderId) {
    return updateThread(orderId, (thread) => ({
      ok: true,
      value: { ...thread, demoPaymentAt: thread.demoPaymentAt ?? new Date().toISOString() },
    }))
  },

  async getThread(orderId) {
    const threads = readThreads()
    if (!threads.ok) return threads
    return { ok: true, value: threads.value.find((thread) => thread.orderId === orderId) ?? null }
  },

  async listThreads() {
    const threads = readThreads()
    if (!threads.ok) return threads
    return {
      ok: true,
      value: [...threads.value].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }
  },

  async sendMessage(orderId, author, text) {
    const normalized = text.trim()
    if (!normalized) return { ok: false, error: 'Введите текст сообщения.' }
    if (normalized.length > 2000) return { ok: false, error: 'Сообщение не должно превышать 2000 символов.' }
    return updateThread(orderId, (thread) => {
      if (thread.status === 'closed') return { ok: false, error: 'Обращение закрыто. Откройте его повторно, чтобы продолжить переписку.' }
      const message = makeMessage(author, normalized, new Date().toISOString())
      return {
        ok: true,
        value: { ...thread, messages: [...thread.messages, message] },
      }
    })
  },

  async markCustomerMessagesRead(orderId) {
    return updateThread(orderId, (thread) => ({
      ok: true,
      value: {
        ...thread,
        messages: thread.messages.map((message) =>
          message.author === 'customer' ? { ...message, readBySupport: true } : message,
        ),
      },
    }))
  },

  async setStatus(orderId, status) {
    return updateThread(orderId, (thread) => ({ ok: true, value: { ...thread, status } }))
  },

  async getCustomerThread(orderId) {
    const result = await this.getThread(orderId)
    if (!result.ok) return result
    return result.value
      ? { ok: true, value: result.value }
      : { ok: false, error: 'Обращение не найдено в локальном хранилище этого браузера.' }
  },

  async sendCustomerMessage(orderId, _guestToken, text) {
    const result = await this.sendMessage(orderId, 'customer', text)
    if (!result.ok) return result
    const message = result.value.messages.at(-1)
    return message ? { ok: true, value: message } : { ok: false, error: 'Сообщение не найдено после отправки.' }
  },

  async markCustomerRead(orderId) {
    const result = await this.markCustomerMessagesRead(orderId)
    return result.ok ? { ok: true, value: undefined } : result
  },

  async listCustomerThreads() {
    return this.listThreads()
  },

  async listAdminThreads() {
    return this.listThreads()
  },

  async getAdminThread(orderId) {
    const result = await this.getThread(orderId)
    if (!result.ok) return result
    return result.value
      ? { ok: true, value: result.value }
      : { ok: false, error: 'Обращение не найдено в локальном хранилище этого браузера.' }
  },

  async sendAdminMessage(orderId, text) {
    const result = await this.sendMessage(orderId, 'support', text)
    if (!result.ok) return result
    const message = result.value.messages.at(-1)
    return message ? { ok: true, value: message } : { ok: false, error: 'Сообщение не найдено после отправки.' }
  },

  async setAdminStatus(orderId, status) {
    const result = await this.setStatus(orderId, status)
    return result.ok ? { ok: true, value: undefined } : result
  },

  async revokeGuestAccess() {
    return { ok: false, error: 'У локального прототипа нет отдельного токена доступа.' }
  },

  async reissueGuestAccess() {
    return { ok: false, error: 'У локального прототипа нет отдельного токена доступа.' }
  },

  async sendDeliveredCodes() {
    return { ok: false, error: 'Без backend нельзя безопасно отправить цифровые коды.' }
  },
}
