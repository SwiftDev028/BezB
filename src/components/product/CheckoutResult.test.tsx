// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { Order } from '../../types'
import { CheckoutResult } from './CheckoutResult'

const order: Order = {
  id: 'checkout-test-order',
  number: 'BZB-TEST-1',
  version: 1,
  createdAt: '2026-10-29T10:00:00.000Z',
  updatedAt: '2026-10-29T10:00:00.000Z',
  customer: { name: 'Покупатель', email: 'buyer@example.test' },
  items: [{ productId: 'item-1', title: 'Цифровой товар', platform: 'Test', unitPrice: 1200, quantity: 1 }],
  total: 1200,
  currency: 'RUB',
  paymentStatus: 'unpaid',
  fulfillmentStatus: 'new',
  delivery: { note: '' },
  history: [],
  isDemo: false,
  source: 'checkout',
}

afterEach(cleanup)

describe('результат оформления заказа', () => {
  it('показывает созданный заказ и ссылку на его чат без демо-оплаты', () => {
    render(<MemoryRouter><CheckoutResult order={{ ...order, supportAccessToken: 'a'.repeat(64) }} /></MemoryRouter>)

    expect(screen.getByText('Заказ создан без оплаты')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Открыть чат менеджера' }).getAttribute('href'))
      .toBe(`/support/${order.id}#token=${'a'.repeat(64)}`)
    expect(order.paymentStatus).toBe('unpaid')
  })
})
