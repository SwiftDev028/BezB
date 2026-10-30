// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { localSupportRepository } from './localSupportRepository'

const order = {
  orderId: 'order-local-1',
  orderNumber: 'BZB-LOCAL-1',
  createdAt: '2026-10-29T10:00:00.000Z',
  total: 1200,
  currency: 'RUB' as const,
  items: [{ title: 'Тестовый цифровой товар', quantity: 1, unitPrice: 1200 }],
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('локальный репозиторий поддержки', () => {
  it('требует зарегистрированный локальный заказ, но не требует демо-оплаты для чата', async () => {
    const unknownPayment = await localSupportRepository.confirmDemoPayment('unknown-order')
    expect(unknownPayment).toEqual({
      ok: false,
      error: 'Обращение для этого заказа не найдено в этом браузере.',
    })

    await localSupportRepository.registerOrder(order)
    const message = await localSupportRepository.sendMessage(order.orderId, 'customer', 'Здравствуйте')
    expect(message.ok).toBe(true)
    if (!message.ok) return
    expect(message.value.messages[0]).toMatchObject({
      author: 'customer',
      text: 'Здравствуйте',
      readBySupport: false,
    })
    expect(Object.keys(window.localStorage)).toEqual(['bezb:support:threads'])
  })

  it('поддерживает ответы, непрочитанные сообщения и закрытие с повторным открытием', async () => {
    await localSupportRepository.registerOrder(order)
    await localSupportRepository.confirmDemoPayment(order.orderId)
    const customerMessage = await localSupportRepository.sendMessage(order.orderId, 'customer', 'Нужна помощь')
    expect(customerMessage.ok).toBe(true)

    const unread = await localSupportRepository.listThreads()
    expect(unread.ok && unread.value[0].messages[0].readBySupport).toBe(false)

    const read = await localSupportRepository.markCustomerMessagesRead(order.orderId)
    expect(read.ok && read.value.messages[0].readBySupport).toBe(true)

    const reply = await localSupportRepository.sendMessage(order.orderId, 'support', 'Поможем разобраться')
    expect(reply.ok && reply.value.messages[1].author).toBe('support')

    const closed = await localSupportRepository.setStatus(order.orderId, 'closed')
    expect(closed.ok && closed.value.status).toBe('closed')
    const blockedReply = await localSupportRepository.sendMessage(order.orderId, 'customer', 'Ещё вопрос')
    expect(blockedReply.ok).toBe(false)

    const reopened = await localSupportRepository.setStatus(order.orderId, 'open')
    expect(reopened.ok && reopened.value.status).toBe('open')
    const continued = await localSupportRepository.sendMessage(order.orderId, 'customer', 'Продолжаю')
    expect(continued.ok && continued.value.messages).toHaveLength(3)
  })

  it('повторная демо-оплата не создаёт новый статус или сообщение в заказе', async () => {
    await localSupportRepository.registerOrder(order)
    const first = await localSupportRepository.confirmDemoPayment(order.orderId)
    const second = await localSupportRepository.confirmDemoPayment(order.orderId)
    expect(first.ok && second.ok && second.value.demoPaymentAt).toBe(first.ok ? first.value.demoPaymentAt : null)
    expect(window.localStorage.getItem('bezb:admin:orders')).toBeNull()
  })
})
