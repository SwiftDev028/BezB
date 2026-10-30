// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { localSupportRepository } from '../services/support/localSupportRepository'
import SupportChatPage from './SupportChatPage'

vi.mock('../services/supabase', () => ({ supabaseConfigured: false }))

const order = {
  orderId: 'chat-test-order',
  orderNumber: 'BZB-CHAT-1',
  createdAt: '2026-10-29T10:00:00.000Z',
  total: 1200,
  currency: 'RUB' as const,
  items: [{ title: 'Цифровой товар', quantity: 1, unitPrice: 1200 }],
}

function renderChat() {
  return render(
    <MemoryRouter initialEntries={[`/support/${order.orderId}`]}>
      <Routes><Route path="/support/:orderId" element={<SupportChatPage />} /></Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('чат поддержки покупателя', () => {
  it('не открывает неизвестный заказ, но открывает созданный без демо-оплаты', async () => {
    const unknown = renderChat()
    expect(await screen.findByText('Обращение не найдено в локальном хранилище этого браузера.')).toBeTruthy()
    unknown.unmount()

    await localSupportRepository.registerOrder(order)
    renderChat()
    const input = await screen.findByLabelText('Ваше сообщение')
    fireEvent.change(input, { target: { value: 'Нужна помощь по заказу' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Нужна помощь по заказу')).toBeTruthy()
    expect(screen.getByText('Покупатель')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Мои обращения' })[0].getAttribute('href')).toBe('/support')
  })

  it('показывает сетевую ошибку отправки и позволяет повторить попытку', async () => {
    await localSupportRepository.registerOrder(order)
    vi.spyOn(localSupportRepository, 'sendCustomerMessage').mockRejectedValueOnce(new Error('Нет соединения'))
    renderChat()
    const input = await screen.findByLabelText('Ваше сообщение')
    fireEvent.change(input, { target: { value: 'Повторное сообщение' } })
    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Нет соединения')
    expect((input as HTMLTextAreaElement).value).toBe('Повторное сообщение')
    expect((screen.getByRole('button', { name: 'Отправить' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
