// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from '../components/layout/Footer'
import RefundPolicyPage from './RefundPolicyPage'

afterEach(cleanup)

describe('страница правил возврата', () => {
  it('показывает дату, все восемь разделов и нерешённый статус контакта', () => {
    render(
      <MemoryRouter initialEntries={['/refunds']}>
        <RefundPolicyPage />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Правила возврата и отмены заказа' })).toBeTruthy()
    expect(screen.getByText('28.10.2026')).toBeTruthy()
    for (const heading of [
      '1. Общие положения',
      '2. Отмена заказа до получения товара',
      '3. Ошибка в электронной почте или данных заказа',
      '4. Код не работает или товар не соответствует описанию',
      '5. Ошибочный выбор региона или платформы',
      '6. Отказ от цифрового товара',
      '7. Сроки и способ возврата',
      '8. Как обратиться в поддержку',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy()
    }

    const errorSection = screen.getByRole('heading', {
      name: '4. Код не работает или товар не соответствует описанию',
    }).closest('section')
    expect(errorSection).not.toBeNull()
    expect(within(errorSection!).getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText(/Адрес пока не подтверждён и не является доступным каналом связи/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /указать действующий/ })).toBeNull()
  })

  it('содержит навигацию обратно в магазин и ссылку на странице документов в футере', () => {
    render(
      <MemoryRouter>
        <RefundPolicyPage />
        <Footer />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Вернуться в магазин' }).getAttribute('href')).toBe('/')
    expect(screen.getAllByRole('link', { name: 'Правила возврата и отмены заказа' })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Условия использования' }).map((link) => link.getAttribute('href'))).toEqual(['/terms', '/terms'])
    expect(screen.getAllByRole('link', { name: 'Политика конфиденциальности' }).map((link) => link.getAttribute('href'))).toEqual(['/privacy', '/privacy'])
  })
})
