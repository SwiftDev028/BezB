import type { Currency } from '../types'

/** Форматирование цены. Валюта и локаль вынесены в параметры — задел под мультивалютность. */
export function formatPrice(amount: number, currency: Currency = 'RUB', locale = 'ru-RU'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function discountPercent(price: number, oldPrice?: number): number | null {
  if (!oldPrice || oldPrice <= price) return null
  return Math.round(((oldPrice - price) / oldPrice) * 100)
}
