// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Product } from '../types'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  clearCart: vi.fn(),
  getProduct: vi.fn(),
  user: null as { id: string; email: string; email_confirmed_at?: string } | null,
  messages: [] as { id: string; sender_role: string; body: string; created_at: string }[],
}))

vi.mock('../context/CartContext', () => ({
  useCart: () => ({
    items: [{ productId: 'test-product', quantity: 1 }],
    pending: false,
    count: 1,
    total: 1200,
    clear: mocks.clearCart,
  }),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}))

vi.mock('../context/CatalogContext', () => ({
  useCatalog: () => ({ getProduct: mocks.getProduct }),
}))

vi.mock('../services/supabase', () => ({
  supabaseConfigured: true,
  requireSupabase: () => ({ rpc: mocks.rpc }),
}))

import CheckoutPage from './CheckoutPage'
import SupportChatPage from './SupportChatPage'

const product: Product = {
  id: 'test-product',
  slug: 'test-product',
  title: 'Тестовый цифровой товар',
  category: 'apple',
  platform: 'Test',
  type: 'topup',
  price: 1200,
  currency: 'RUB',
  description: '',
  delivery: '',
  restrictions: [],
  available: true,
  popularity: 0,
  addedAt: '',
  tags: [],
}

beforeEach(() => {
  vi.stubGlobal('crypto', {
    randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
    subtle: { digest: async () => new Uint8Array(32).buffer },
  })
  window.localStorage.clear()
  window.sessionStorage.clear()
  mocks.user = null
  mocks.clearCart.mockReset()
  mocks.getProduct.mockReturnValue(product)
  mocks.messages = []
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown> = {}) => {
    if (name === 'place_public_order_with_support') return {
      data: {
        id: 'checkout-flow-order',
        order_number: 'BZB-FLOW-1',
        created_at: '2026-10-29T10:00:00.000Z',
        consent_at: '2026-10-29T10:00:00.000Z',
        total_amount: 1200,
        guest_access_token: 'a'.repeat(64),
        items: [{
          product_id: product.id,
          product_name: product.title,
          platform: product.platform,
          unit_price: product.price,
          quantity: 1,
        }],
      },
      error: null,
    }
    if (name === 'place_buyer_order_with_support') return {
      data: {
        id: 'checkout-flow-buyer-order',
        order_number: 'BZB-FLOW-2',
        created_at: '2026-10-29T10:00:00.000Z',
        consent_at: '2026-10-29T10:00:00.000Z',
        total_amount: 1200,
        items: [{
          product_id: product.id,
          product_name: product.title,
          platform: product.platform,
          unit_price: product.price,
          quantity: 1,
        }],
      },
      error: null,
    }
    if (name === 'support_customer_get_thread') return {
      data: {
        id: 'support-thread-id',
        order_id: 'checkout-flow-order',
        order_number: 'BZB-FLOW-1',
        status: 'open',
        created_at: '2026-10-29T10:00:00.000Z',
        total_amount: 1200,
        payment_status: 'unpaid',
        fulfillment_status: 'new',
        items: [{ product_name: product.title, quantity: 1, unit_price: product.price }],
        messages: mocks.messages,
      },
      error: null,
    }
    if (name === 'support_customer_mark_read') return { data: null, error: null }
    if (name === 'support_customer_send_message') {
      const message = {
        id: 'message-1',
        sender_role: 'customer',
        body: args.p_body as string,
        created_at: '2026-10-29T10:01:00.000Z',
      }
      mocks.messages.push(message)
      return { data: message, error: null }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('checkout и чат поддержки', () => {
  it('создаёт неоплаченный заказ с диалогом, открывает URL-fragment и отправляет сообщение', async () => {
    render(
      <MemoryRouter initialEntries={['/checkout']}>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/support/:orderId" element={<SupportChatPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByLabelText('Телефон')).toBeNull()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Покупатель' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.test' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Оформить заказ' }))

    expect(await screen.findByText('Поддержка BezB')).toBeTruthy()
    expect(mocks.rpc).toHaveBeenCalledWith('place_public_order_with_support', expect.objectContaining({
      p_customer_phone: null,
      p_idempotency_key: expect.any(String),
    }))
    expect(mocks.clearCart).toHaveBeenCalledOnce()
    expect(mocks.rpc).toHaveBeenCalledWith('support_customer_get_thread', {
      p_order_id: 'checkout-flow-order',
      p_guest_token: 'a'.repeat(64),
    })
    const message = await screen.findByLabelText('Ваше сообщение')
    fireEvent.change(message, { target: { value: 'Вопрос по заказу' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Вопрос по заказу')).toBeTruthy()
    expect(mocks.rpc).toHaveBeenCalledWith('support_customer_send_message', {
      p_order_id: 'checkout-flow-order',
      p_guest_token: 'a'.repeat(64),
      p_body: 'Вопрос по заказу',
    })
    expect(mocks.messages).toHaveLength(1)
  })

  it('создаёт чат для авторизованного покупателя без гостевого токена', async () => {
    mocks.user = { id: 'buyer-user-id', email: 'buyer@example.test', email_confirmed_at: '2026-10-29T09:00:00.000Z' }
    render(
      <MemoryRouter initialEntries={['/checkout']}>
        <Routes>
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/support/:orderId" element={<SupportChatPage />} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Покупатель' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'buyer@example.test' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Оформить заказ' }))

    expect(await screen.findByText('Поддержка BezB')).toBeTruthy()
    expect(mocks.rpc).toHaveBeenCalledWith('place_buyer_order_with_support', expect.objectContaining({
      p_idempotency_key: expect.any(String),
    }))
    expect(mocks.rpc).toHaveBeenCalledWith('support_customer_get_thread', {
      p_order_id: 'checkout-flow-buyer-order',
      p_guest_token: null,
    })
    expect(window.location.hash).toBe('')
  })
})
