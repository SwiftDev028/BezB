// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManualDelivery, ManualDeliveryInput, OrderItem } from '../../types'
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
  deliveries: [] as ManualDelivery[],
  inventoryDeliveredCounts: {},
  inventoryReservedCounts: {},
  busy: false,
  onIssue: vi.fn(async (_key: string, _deliveries: ManualDeliveryInput[]) => true),
  onUpdate: vi.fn(async (_id: string, _revision: number, _delivery: ManualDeliveryInput) => true),
  onResend: vi.fn(async () => {}),
}

function existingDelivery(overrides: Partial<ManualDelivery> = {}): ManualDelivery {
  return {
    id: 'delivery-1',
    orderItemId: 'item-1',
    title: 'Gift Card',
    activationCode: 'CURRENT-KEY',
    login: 'old@example.com',
    password: 'OLD-PASSWORD',
    additionalData: '',
    instructions: 'Old instruction',
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    revision: 3,
    history: [],
    ...overrides,
  }
}

beforeEach(() => {
  window.sessionStorage.clear()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('manual order delivery form', () => {
  it('creates an independent delivery form for every order unit, including identical products', () => {
    render(<ManualDeliveryPanel {...baseProps} />)

    expect(screen.getByRole('article', { name: 'Ожидает выдачи: Gift Card · единица 1' })).toBeTruthy()
    expect(screen.getByRole('article', { name: 'Ожидает выдачи: Gift Card · единица 2' })).toBeTruthy()
    expect(screen.getByRole('article', { name: 'Ожидает выдачи: Account · единица 1' })).toBeTruthy()
    expect(screen.getByText('Выдано 0 из 3 единиц.')).toBeTruthy()
  })

  it('issues two separate units of the same product with distinct idempotency keys', async () => {
    const onIssue = vi.fn(async (_key: string, _deliveries: ManualDeliveryInput[]) => true)
    render(<ManualDeliveryPanel {...baseProps} onIssue={onIssue} />)

    fireEvent.change(screen.getByLabelText('Ключ / код активации · Gift Card · единица 1'), { target: { value: 'KEY-ONE' } })
    fireEvent.change(screen.getByLabelText('Ключ / код активации · Gift Card · единица 2'), { target: { value: 'KEY-TWO' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Выдать покупателю' })[0])
    await waitFor(() => expect(onIssue).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getAllByRole('button', { name: 'Выдать покупателю' })[1])

    expect(onIssue).toHaveBeenCalledTimes(2)
    expect(onIssue.mock.calls[0][1]).toEqual([expect.objectContaining({ orderItemId: 'item-1', activationCode: 'KEY-ONE' })])
    expect(onIssue.mock.calls[1][1]).toEqual([expect.objectContaining({ orderItemId: 'item-1', activationCode: 'KEY-TWO' })])
    expect(onIssue.mock.calls[0][0]).not.toBe(onIssue.mock.calls[1][0])
  })

  it('edits saved key, login, password, and other fields with optimistic revision', async () => {
    const onUpdate = vi.fn(async (_id: string, _revision: number, _delivery: ManualDeliveryInput) => true)
    render(<ManualDeliveryPanel {...baseProps} deliveries={[existingDelivery()]} onUpdate={onUpdate} />)

    fireEvent.change(screen.getByLabelText('Ключ / код активации · Gift Card · единица 1'), { target: { value: 'UPDATED-KEY' } })
    fireEvent.change(screen.getByLabelText('Логин · Gift Card · единица 1'), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText('Пароль · Gift Card · единица 1'), { target: { value: 'NEW-PASSWORD' } })
    fireEvent.change(screen.getByLabelText('Инструкция по активации · Gift Card · единица 1'), { target: { value: 'Updated instruction' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить изменения' }))

    expect(onUpdate).toHaveBeenCalledWith('delivery-1', 3, expect.objectContaining({
      orderItemId: 'item-1',
      activationCode: 'UPDATED-KEY',
      login: 'new@example.com',
      password: 'NEW-PASSWORD',
      instructions: 'Updated instruction',
    }))
  })

  it('shows admin change history without storing or displaying old secret values', () => {
    render(<ManualDeliveryPanel {...baseProps} deliveries={[existingDelivery({
      revision: 4,
      history: [{
        revision: 4,
        changedFields: ['activation_code', 'login'],
        changedAt: '2026-11-01T10:00:00.000Z',
        changedBy: 'admin-1',
      }],
    })]} />)

    fireEvent.click(screen.getByText('История изменений (1)'))
    expect(screen.getByText(/изменены поля: activation_code, login/)).toBeTruthy()
    expect(screen.queryByText('PREVIOUS-SECRET')).toBeNull()
  })

  it('requires payment for new issuance but still allows editing an already-issued delivery', () => {
    const onUpdate = vi.fn(async (_id: string, _revision: number, _delivery: ManualDeliveryInput) => true)
    render(<ManualDeliveryPanel
      {...baseProps}
      paymentStatus="unpaid"
      deliveries={[existingDelivery()]}
      onUpdate={onUpdate}
    />)

    expect(screen.getAllByRole('button', { name: 'Выдать покупателю' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    expect((screen.getByRole('button', { name: 'Сохранить изменения' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('resends the existing unit without issuing a new one', () => {
    const onIssue = vi.fn(async (_key: string, _deliveries: ManualDeliveryInput[]) => true)
    const onResend = vi.fn(async () => {})
    render(<ManualDeliveryPanel
      {...baseProps}
      deliveries={[existingDelivery()]}
      onIssue={onIssue}
      onResend={onResend}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Повторно отправить' }))

    expect(onResend).toHaveBeenCalledWith('delivery-1')
    expect(onIssue).not.toHaveBeenCalled()
  })
})
