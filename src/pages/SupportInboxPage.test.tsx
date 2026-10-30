// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { localSupportRepository } from '../services/support/localSupportRepository'
import SupportInboxPage from './SupportInboxPage'

vi.mock('../services/supabase', () => ({ supabaseConfigured: false }))

const order = {
  orderId: 'admin-chat-order',
  orderNumber: 'BZB-ADMIN-1',
  createdAt: '2026-10-29T10:00:00.000Z',
  total: 1200,
  currency: 'RUB' as const,
  items: [{ title: 'Цифровой товар', quantity: 1, unitPrice: 1200 }],
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(cleanup)

describe('админский список поддержки', () => {
  it('показывает новые сообщения и позволяет ответить и закрыть обращение', async () => {
    await localSupportRepository.registerOrder(order)
    await localSupportRepository.confirmDemoPayment(order.orderId)
    await localSupportRepository.sendMessage(order.orderId, 'customer', 'Покупатель написал')

    render(<MemoryRouter><SupportInboxPage /></MemoryRouter>)
    expect(await screen.findByText('1 новых')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Заказ BZB-ADMIN-1/ }))
    expect(await screen.findAllByText('Покупатель написал')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('Ответ поддержки'), { target: { value: 'Ответ поддержки' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Ответ поддержки', { selector: 'p' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть обращение' }))
    expect(await screen.findByText(/Обращение закрыто/)).toBeTruthy()
    const stored = await localSupportRepository.getThread(order.orderId)
    expect(stored.ok && stored.value?.status).toBe('closed')
  })
})
