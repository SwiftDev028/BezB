import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../supabase', () => ({ requireSupabase: () => ({ rpc }) }))

import { supabaseSupportRepository } from './supabaseSupportRepository'

const thread = {
  id: 'thread-1',
  order_id: 'order-1',
  order_number: 'BZB-1001',
  status: 'open',
  created_at: '2026-10-30T00:00:00.000Z',
  total_amount: 1500,
  payment_status: 'unpaid',
  fulfillment_status: 'new',
  items: [{ product_name: 'Товар', quantity: 1, unit_price: 1500 }],
  messages: [],
}

beforeEach(() => {
  rpc.mockReset()
})

describe('Supabase support repository', () => {
  it('uses the guest token to fetch the chat and does not receive a token hash', async () => {
    rpc.mockResolvedValue({ data: thread, error: null })
    const result = await supabaseSupportRepository.getCustomerThread('order-1', 'a'.repeat(64))

    expect(rpc).toHaveBeenCalledWith('support_customer_get_thread', {
      p_order_id: 'order-1',
      p_guest_token: 'a'.repeat(64),
    })
    expect(result.ok && result.value.orderId).toBe('order-1')
    expect(result.ok && 'guest_token_hash' in result.value).toBe(false)
  })

  it('surfaces server denial for invalid, revoked, or foreign-order credentials', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Support conversation unavailable' } })
    const result = await supabaseSupportRepository.getCustomerThread('another-order', 'invalid')

    expect(result).toEqual({ ok: false, error: 'Support conversation unavailable' })
  })

  it('maps summary rows that intentionally omit item and message details', async () => {
    rpc.mockResolvedValue({
      data: [{
        id: 'thread-1',
        order_id: 'order-1',
        order_number: 'BZB-1001',
        status: 'open',
        created_at: '2026-10-30T00:00:00.000Z',
        total_amount: 1500,
        last_message: 'Нужна помощь',
        unread_count: 1,
      }],
      error: null,
    })
    const result = await supabaseSupportRepository.listAdminThreads()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value[0].lastMessage).toBe('Нужна помощь')
      expect(result.value[0].items).toEqual([])
      expect(result.value[0].messages).toEqual([])
      expect(result.value[0].unreadCount).toBe(1)
    }
  })

  it('sends customer messages without a client-selected author role', async () => {
    rpc.mockResolvedValue({
      data: { id: 'message-1', sender_role: 'customer', body: 'Здравствуйте', created_at: '2026-10-30T00:01:00.000Z' },
      error: null,
    })
    const result = await supabaseSupportRepository.sendCustomerMessage('order-1', 'a'.repeat(64), 'Здравствуйте')

    expect(rpc).toHaveBeenCalledWith('support_customer_send_message', {
      p_order_id: 'order-1',
      p_guest_token: 'a'.repeat(64),
      p_body: 'Здравствуйте',
    })
    expect(result.ok && result.value.author).toBe('customer')
  })

  it('sends manager replies through the separate privileged RPC', async () => {
    rpc.mockResolvedValue({
      data: { id: 'message-2', sender_role: 'manager', body: 'Ответ', created_at: '2026-10-30T00:02:00.000Z' },
      error: null,
    })
    const result = await supabaseSupportRepository.sendAdminMessage('order-1', 'Ответ')

    expect(rpc).toHaveBeenCalledWith('support_admin_send_message', {
      p_order_id: 'order-1',
      p_body: 'Ответ',
    })
    expect(result.ok && result.value.author).toBe('support')
  })

  it('uses the delivery RPC for codes, rather than a public code lookup', async () => {
    rpc.mockResolvedValue({
      data: { id: 'delivery-message', sender_role: 'manager', body: 'Код выдан', created_at: '2026-10-30T00:03:00.000Z' },
      error: null,
    })
    await supabaseSupportRepository.sendDeliveredCodes('order-1')

    expect(rpc).toHaveBeenCalledWith('support_admin_send_delivered_codes', { p_order_id: 'order-1' })
  })
})
