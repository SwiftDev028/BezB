import { describe, expect, it } from 'vitest'
import { discountPercent, formatPrice } from './format'

describe('форматирование', () => {
  it('форматирует рубли', () => {
    expect(formatPrice(1190)).toMatch(/1\s?190/)
    expect(formatPrice(1190)).toContain('₽')
  })

  it('считает процент скидки', () => {
    expect(discountPercent(75, 100)).toBe(25)
    expect(discountPercent(100, 100)).toBeNull()
    expect(discountPercent(100)).toBeNull()
  })
})
