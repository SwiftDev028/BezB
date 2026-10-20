import type { CartItem, Order, Product, Result } from '../types'
import { createOrder } from './orders'

export interface CheckoutErrors {
  name?: string
  email?: string
  agree?: string
}

export const MAX_NAME = 100
export const MAX_EMAIL = 254
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateCheckout(name: string, email: string, agree: boolean): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (name.trim().length < 2) errors.name = 'Укажите имя — не короче двух символов.'
  else if (name.trim().length > MAX_NAME) errors.name = `Имя слишком длинное — не больше ${MAX_NAME} символов.`
  if (!email.trim()) errors.email = 'Укажите email для связи по заказу.'
  else if (email.trim().length > MAX_EMAIL) errors.email = 'Email слишком длинный.'
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'Проверьте email: адрес должен выглядеть как name@example.com.'
  if (!agree) errors.agree = 'Подтвердите, что ознакомились с условиями.'
  return errors
}

export const CHECKOUT_NOTE = 'Заказ оформлен покупателем на сайте (демо). Оплата не подключена, товар не выдан.'

/**
 * Собирает демо-заказ из корзины. Цены и названия берутся из каталога в момент вызова и дальше не меняются.
 * Статусы: оплата — «Ожидает оплаты», выполнение — «Ожидает обработки». Оплаченным заказ автоматически не становится.
 */
export function buildCheckoutOrder(
  cart: CartItem[],
  customer: { name: string; email: string },
  existing: Order[],
  lookup: (id: string) => Product | undefined,
  now: string,
): Result<Order> {
  if (cart.length === 0) return { ok: false, error: 'Корзина пуста.' }

  const checked = validateCheckout(customer.name, customer.email, true)
  if (checked.name || checked.email) return { ok: false, error: checked.name ?? checked.email ?? 'Проверьте данные.' }

  for (const item of cart) {
    const p = lookup(item.productId)
    if (!p) return { ok: false, error: 'Один из товаров больше не продаётся. Удалите его из корзины.' }
    if (!p.available) return { ok: false, error: `Товара «${p.title}» нет в наличии. Удалите его из корзины.` }
    if (p.regions) {
      if (!item.region || !p.regions.includes(item.region))
        return { ok: false, error: `Для «${p.title}» не выбран регион. Удалите позицию и добавьте её со страницы товара.` }
    }
  }

  return createOrder(
    {
      customer: { name: customer.name.trim(), email: customer.email.trim() },
      lines: cart.map((i) => ({ productId: i.productId, quantity: i.quantity, region: i.region })),
    },
    existing,
    lookup,
    now,
    CHECKOUT_NOTE,
    { paymentStatus: 'pending', source: 'checkout' },
  )
}
