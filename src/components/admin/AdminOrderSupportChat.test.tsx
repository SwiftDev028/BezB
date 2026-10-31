// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localSupportRepository } from '../../services/support/localSupportRepository'
import type { SupportOrderRegistration } from '../../types'
import { AdminOrderSupportChat } from './AdminOrderSupportChat'

vi.mock('../../services/supabase', () => ({ supabaseConfigured: false }))

const order = (orderId: string, orderNumber: string): SupportOrderRegistration => ({
  orderId,
  orderNumber,
  createdAt: '2026-10-31T12:00:00.000Z',
  total: 1000,
  currency: 'RUB',
  items: [{ title: 'Digital item', quantity: 1, unitPrice: 1000 }],
})

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('chat in admin order details', () => {
  it('loads the thread for this order, polls updates and sends replies into the shared history', async () => {
    const firstOrder = order('order-1', 'BZB-1')
    const otherOrder = order('order-2', 'BZB-2')
    await localSupportRepository.registerOrder(firstOrder)
    await localSupportRepository.registerOrder(otherOrder)
    await localSupportRepository.sendMessage('order-1', 'customer', 'Question for first order')
    await localSupportRepository.sendMessage('order-2', 'customer', 'Private message from second order')
    vi.useFakeTimers()
    const getAdminThread = vi.spyOn(localSupportRepository, 'getAdminThread')
    render(<AdminOrderSupportChat orderId="order-1" manualDeliveries={[]} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

    expect(screen.getByText('Question for first order')).toBeTruthy()
    expect(screen.queryByText('Private message from second order')).toBeNull()
    expect(getAdminThread).toHaveBeenCalledWith('order-1')

    await localSupportRepository.sendMessage('order-1', 'customer', 'New customer message')
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(screen.getAllByText('New customer message')).toHaveLength(1)

    const input = screen.getByLabelText('Ответ поддержки')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Reply from order card' } })
      fireEvent.click(screen.getByRole('button', { name: 'Отправить' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Reply from order card')).toBeTruthy()
    const sharedThread = await localSupportRepository.getAdminThread('order-1')
    expect(sharedThread.ok && sharedThread.value.messages.map((message) => message.text)).toContain('Reply from order card')
  })

  it('does not overlap polling requests and clears its timer when unmounted', async () => {
    await localSupportRepository.registerOrder(order('order-poll', 'BZB-POLL'))
    vi.useFakeTimers()
    const readThread = localSupportRepository.getAdminThread.bind(localSupportRepository)
    let finishRequest: ((value: Awaited<ReturnType<typeof readThread>>) => void) | undefined
    const pending = new Promise<Awaited<ReturnType<typeof readThread>>>((resolve) => {
      finishRequest = resolve
    })
    const getAdminThread = vi.spyOn(localSupportRepository, 'getAdminThread')
      .mockImplementationOnce(readThread)
      .mockImplementationOnce(() => pending)
      .mockImplementation(readThread)
    const view = render(<AdminOrderSupportChat orderId="order-poll" manualDeliveries={[]} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })

    expect(getAdminThread).toHaveBeenCalledTimes(2)
    view.unmount()
    finishRequest?.(await readThread('order-poll'))
    await act(async () => { await Promise.resolve() })
    expect(vi.getTimerCount()).toBe(0)
  })
})
