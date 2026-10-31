// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

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

  it('обновляет список обращений каждые пять секунд', async () => {
    await localSupportRepository.registerOrder(order)
    vi.useFakeTimers()
    const listThreads = vi.spyOn(localSupportRepository, 'listAdminThreads')
    render(<MemoryRouter><SupportInboxPage /></MemoryRouter>)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    expect(listThreads).toHaveBeenCalledTimes(1)
    await localSupportRepository.sendMessage(order.orderId, 'customer', 'Новое сообщение покупателя')
    await localSupportRepository.setStatus(order.orderId, 'closed')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(listThreads).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Новое сообщение покупателя')).toBeTruthy()
    expect(screen.getByText('1 новых')).toBeTruthy()
    expect(screen.getByText('Закрыто')).toBeTruthy()
  })

  it('обновляет открытый диалог без дублей и сохраняет черновик ответа', async () => {
    await localSupportRepository.registerOrder(order)
    await localSupportRepository.registerOrder({
      ...order,
      orderId: 'another-admin-chat-order',
      orderNumber: 'BZB-ADMIN-2',
    })
    vi.useFakeTimers()
    const getAdminThread = vi.spyOn(localSupportRepository, 'getAdminThread')
    const view = render(<MemoryRouter><SupportInboxPage /></MemoryRouter>)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: /Заказ BZB-ADMIN-1/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    const reply = screen.getByLabelText('Ответ поддержки') as HTMLTextAreaElement
    fireEvent.change(reply, { target: { value: 'Черновик менеджера' } })
    await localSupportRepository.sendMessage(order.orderId, 'customer', 'Сообщение во время открытого чата')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(getAdminThread).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('Сообщение во время открытого чата', { selector: 'p' })).toHaveLength(1)
    expect((screen.getByLabelText('Ответ поддержки') as HTMLTextAreaElement).value).toBe('Черновик менеджера')

    fireEvent.click(screen.getByRole('button', { name: /Заказ BZB-ADMIN-2/ }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(getAdminThread).toHaveBeenCalledTimes(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(getAdminThread).toHaveBeenCalledTimes(4)
    expect(getAdminThread.mock.calls[3][0]).toBe('another-admin-chat-order')
    expect(vi.getTimerCount()).toBe(2)

    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('не запускает повторный запрос открытого диалога, пока предыдущий не завершился', async () => {
    await localSupportRepository.registerOrder(order)
    vi.useFakeTimers()
    const readAdminThread = localSupportRepository.getAdminThread.bind(localSupportRepository)
    let resolveDetails: ((value: Awaited<ReturnType<typeof localSupportRepository.getAdminThread>>) => void) | undefined
    const pendingDetails = new Promise<Awaited<ReturnType<typeof localSupportRepository.getAdminThread>>>((resolve) => {
      resolveDetails = resolve
    })
    const getAdminThread = vi.spyOn(localSupportRepository, 'getAdminThread')
      .mockImplementationOnce(() => pendingDetails)
      .mockImplementation(readAdminThread)

    render(<MemoryRouter><SupportInboxPage /></MemoryRouter>)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: /Заказ BZB-ADMIN-1/ }))
    expect(getAdminThread).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(getAdminThread).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDetails?.(await readAdminThread(order.orderId))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(getAdminThread).toHaveBeenCalledTimes(2)
  })
})
