// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProductDescription, productDescriptionPreview } from './ProductDescription'

afterEach(() => cleanup())

describe('ProductDescription', () => {
  it('renders structured headings, paragraphs, lists, and warnings', () => {
    render(
      <ProductDescription
        description={'## Издание\n\nТекст описания.\n\n- Первый пункт\n- Второй пункт\n\n> ⚠️ Важно для покупки.'}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Издание' })).toBeTruthy()
    expect(screen.getByText('Текст описания.')).toBeTruthy()
    expect(screen.getByRole('list').querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByRole('note').textContent).toContain('Важно для покупки.')
  })

  it('renders approved Rockstar links and treats HTML as text', () => {
    const { container } = render(
      <ProductDescription
        description={'[Условия](https://www.rockstargames.com/legal)\n\n<img src=x onerror=alert(1)>'}
      />,
    )

    expect(screen.getByRole('link', { name: 'Условия' }).getAttribute('href')).toBe('https://www.rockstargames.com/legal')
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('creates a compact plain-text card excerpt and truncates long descriptions', () => {
    expect(productDescriptionPreview('## Раздел\n\n**Внимание:** подробнее.', 200)).toBe('Раздел Внимание: подробнее.')
    expect(productDescriptionPreview('Коротко и по делу.', 8)).toBe('Коротко…')
  })
})
