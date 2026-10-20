import type { Order, PaymentStatus } from '../../types'

/**
 * Контракт платёжного провайдера (заготовка под будущую интеграцию).
 *
 * Важно для безопасности: платёж создаётся и подтверждается на СЕРВЕРЕ.
 * Frontend только получает ссылку на оплату и показывает статус. Статус «оплачен» никогда не должен
 * выставляться по данным из браузера — только по подписанному уведомлению (webhook) провайдера.
 */
export interface PaymentSession {
  providerPaymentId: string
  /** Куда отправить покупателя для оплаты (страница провайдера) */
  redirectUrl: string
}

export interface PaymentProvider {
  readonly id: string
  /** Создать платёж на backend. Возвращает ссылку на оплату. */
  createPayment(order: Order): Promise<PaymentSession>
  /** Получить актуальный статус платежа с backend. */
  getStatus(orderId: string): Promise<PaymentStatus>
}

/**
 * Текущий режим: оплаты нет, статусы меняет администратор вручную.
 * Намеренно не умеет создавать платежи — вызов явно сообщает, что оплата не подключена.
 */
export const manualPaymentProvider: PaymentProvider = {
  id: 'manual',
  async createPayment() {
    throw new Error('Оплата не подключена: в демо-режиме статусы оплаты меняются вручную.')
  },
  async getStatus() {
    throw new Error('Оплата не подключена: статус хранится в самом заказе.')
  },
}
