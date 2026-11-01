// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SupportAuthor, SupportThread } from '../../types'
import { SupportConversation } from './SupportConversation'

const thread: SupportThread = {
  orderId: 'order-1',
  orderNumber: 'BZB-1',
  createdAt: '2026-11-01T10:00:00.000Z',
  total: 1000,
  currency: 'RUB',
  items: [],
  demoPaymentAt: null,
  status: 'open',
  messages: [
    {
      id: 'welcome',
      author: 'system',
      text: 'Здравствуйте! Спасибо за заказ в BezB!\n\nВаш заказ получен.',
      sentAt: '2026-11-01T10:00:00.000Z',
      readBySupport: true,
    },
    {
      id: 'followup',
      author: 'system',
      text: 'Сейчас у нас повышенная загруженность.\n\nМы ответим, как только освободимся.',
      sentAt: '2026-11-01T10:05:00.000Z',
      readBySupport: true,
    },
  ],
}

afterEach(cleanup)

describe('SupportConversation automatic messages', () => {
  it.each<SupportAuthor>(['customer', 'support'])(
    'renders welcome and follow-up as ordinary incoming BezB messages for %s',
    (author) => {
      render(<SupportConversation thread={thread} author={author} onChange={() => {}} />)

      const senderLabels = screen.getAllByText('BezB')
      expect(senderLabels).toHaveLength(2)
      for (const sender of senderLabels) {
        const bubble = sender.closest('article')
        expect(bubble?.className).toContain('bg-graphite')
        expect(bubble?.className).toContain('whitespace-pre-wrap')
        expect(bubble?.className).not.toContain('mx-auto')
        expect(bubble?.className).not.toContain('text-center')
      }

      expect(screen.getByText(/Спасибо за заказ в BezB!/).textContent).toContain('\n\n')
      expect(screen.getByText(/повышенная загруженность/).textContent).toContain('\n\n')
      expect(screen.queryByText(/BezB · уведомление/)).toBeNull()
    },
  )
})
