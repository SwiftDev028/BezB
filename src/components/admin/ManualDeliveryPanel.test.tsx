// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManualDeliveryInput, OrderItem } from '../../types'
import { ManualDeliveryPanel } from './ManualDeliveryPanel'

const items: OrderItem[] = [
  { id: 'item-1', productId: 'gift-card', title: 'Gift Card', platform: 'Apple', unitPrice: 1000, quantity: 2 },
  { id: 'item-2', productId: 'account', title: 'Account', platform: 'Game', unitPrice: 2000, quantity: 1 },
]

const baseProps = {
  orderId: 'order-1',
  orderItems: items,
  paymentStatus: 'paid' as const,
  fulfillmentStatus: 'processing' as const,
  deliveries: [],
  inventoryDeliveredCounts: {},
  busy: false,
  onIssue: vi.fn(async (_key: string, _deliveries: ManualDeliveryInput[]) => true),
  onResend: vi.fn(async () => {}),
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('manual order delivery form', () => {
  it('confirms and sends multiple delivered products with an idempotency key', async () => {
    const onIssue = vi.fn(async (_key: string, _deliveries: ManualDeliveryInput[]) => true)
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<ManualDeliveryPanel {...baseProps} onIssue={onIssue} />)

    fireEvent.change(screen.getByLabelText('Ключ / код активации 1'), { target: { value: 'KEY-ONE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар или ключ' }))
    fireEvent.change(screen.getByLabelText('Позиция заказа 2'), { target: { value: 'item-2' } })
    fireEvent.change(screen.getByLabelText('Логин 2'), { target: { value: 'buyer@example.com' } })
    fireEvent.change(screen.getByLabelText('Пароль 2'), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Выдать покупателю' }))

    expect(await screen.findByText('Товар 1')).toBeTruthy()
    expect(onIssue).toHaveBeenCalledTimes(1)
    const [requestKey, entries] = onIssue.mock.calls[0]
    expect(requestKey).toMatch(/^[0-9a-f-]{36}$/i)
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ orderItemId: 'item-1', activationCode: 'KEY-ONE' }),
      expect.objectContaining({ orderItemId: 'item-2', login: 'buyer@example.com', password: 'secret-password' }),
    ]))
  })

  it('keeps the same request key after a retry and blocks duplicate submissions', async () => {
    let finishIssue: ((result: boolean) => void) | undefined
    const pending = new Promise<boolean>((resolve) => { finishIssue = resolve })
    const onIssue = vi.fn((_key: string, _deliveries: ManualDeliveryInput[]) => pending)
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(true)
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<ManualDeliveryPanel {...baseProps} onIssue={onIssue} />)

    fireEvent.change(screen.getByLabelText('Ключ / код активации 1'), { target: { value: 'KEY-ONE' } })
    const submit = screen.getByRole('button', { name: 'Выдать покупателю' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(onIssue).toHaveBeenCalledTimes(1)
    const firstRequestKey = onIssue.mock.calls[0][0]
    await act(async () => {
      finishIssue?.(false)
      await pending
    })
    fireEvent.click(screen.getByRole('button', { name: 'Выдать покупателю' }))

    expect(onIssue).toHaveBeenCalledTimes(2)
    expect(onIssue.mock.calls[1][0]).toBe(firstRequestKey)
  })

  it('requires payment and displays already delivered data with per-field copy controls', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<ManualDeliveryPanel
      {...baseProps}
      paymentStatus="unpaid"
      deliveries={[{
        id: 'delivery-1',
        orderItemId: 'item-1',
        title: 'Gift Card USA',
        activationCode: 'KEY-SECRET',
        login: '',
        password: '',
        additionalData: '',
        instructions: 'Activate at example.com',
        createdAt: '2026-10-31T12:00:00.000Z',
      }]}
    />)

    expect((screen.getByRole('button', { name: 'Выдать покупателю' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Gift Card: 1/2 шт. выдано')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Копировать код' }))
    expect(writeText).toHaveBeenCalledWith('KEY-SECRET')
  })

  it('resends an existing delivery by id without submitting another issuance', () => {
    const onIssue = vi.fn(async (_key: string, _deliveries: ManualDeliveryInput[]) => true)
    const onResend = vi.fn(async () => {})
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<ManualDeliveryPanel
      {...baseProps}
      deliveries={[{
        id: 'delivery-1',
        orderItemId: 'item-1',
        title: 'Gift Card USA',
        activationCode: 'KEY-SECRET',
        login: '',
        password: '',
        additionalData: '',
        instructions: '',
        createdAt: '2026-10-31T12:00:00.000Z',
      }]}
      onIssue={onIssue}
      onResend={onResend}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Повторно отправить в чат' }))

    expect(onResend).toHaveBeenCalledWith('delivery-1')
    expect(onIssue).not.toHaveBeenCalled()
  })
})
