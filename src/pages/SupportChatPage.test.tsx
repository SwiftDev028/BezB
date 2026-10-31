// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  vi.useRealTimers()
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

  it('получает новые ответы менеджера, не дублирует сообщения и сохраняет черновик', async () => {
    await localSupportRepository.registerOrder(order)
    vi.useFakeTimers()
    const getCustomerThread = vi.spyOn(localSupportRepository, 'getCustomerThread')
    renderChat()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    const input = screen.getByLabelText('Ваше сообщение') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Мой незавершённый черновик' } })

    await localSupportRepository.sendMessage(order.orderId, 'support', 'Ответ менеджера')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(screen.getAllByText('Ответ менеджера', { selector: 'p' })).toHaveLength(1)
    expect((screen.getByLabelText('Ваше сообщение') as HTMLTextAreaElement).value).toBe('Мой незавершённый черновик')
    expect(getCustomerThread).toHaveBeenCalledTimes(2)
  })

  it('не запускает параллельный запрос и прекращает polling при размонтировании', async () => {
    await localSupportRepository.registerOrder(order)
    vi.useFakeTimers()
    const readThread = localSupportRepository.getCustomerThread.bind(localSupportRepository)
    let resolvePending: ((value: Awaited<ReturnType<typeof readThread>>) => void) | undefined
    const pending = new Promise<Awaited<ReturnType<typeof readThread>>>((resolve) => {
      resolvePending = resolve
    })
    const getCustomerThread = vi.spyOn(localSupportRepository, 'getCustomerThread')
      .mockImplementationOnce(readThread)
      .mockImplementationOnce(() => pending)
      .mockImplementation(readThread)

    const view = renderChat()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(getCustomerThread).toHaveBeenCalledTimes(2)

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(getCustomerThread).toHaveBeenCalledTimes(2)

    view.unmount()
    resolvePending?.(await readThread(order.orderId))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(getCustomerThread).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('сохраняет открытый чат и черновик при временной ошибке обновления', async () => {
    await localSupportRepository.registerOrder(order)
    vi.useFakeTimers()
    const readThread = localSupportRepository.getCustomerThread.bind(localSupportRepository)
    const getCustomerThread = vi.spyOn(localSupportRepository, 'getCustomerThread')
      .mockImplementationOnce(readThread)
      .mockRejectedValueOnce(new Error('Нет соединения'))
    renderChat()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
    const input = screen.getByLabelText('Ваше сообщение') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Черновик останется' } })

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(screen.getByRole('alert').textContent).toContain('Нет соединения')
    expect(screen.getByRole('log')).toBeTruthy()
    expect((screen.getByLabelText('Ваше сообщение') as HTMLTextAreaElement).value).toBe('Черновик останется')
    expect(getCustomerThread).toHaveBeenCalledTimes(2)
  })
})
