export interface CheckoutErrors {
  name?: string
  email?: string
  agree?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateCheckout(name: string, email: string, agree: boolean): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (name.trim().length < 2) errors.name = 'Укажите имя — не короче двух символов.'
  if (!email.trim()) errors.email = 'Укажите email для связи по заказу.'
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'Проверьте email: адрес должен выглядеть как name@example.com.'
  if (!agree) errors.agree = 'Подтвердите, что ознакомились с условиями.'
  return errors
}
