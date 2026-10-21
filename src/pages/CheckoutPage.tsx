import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Info, ShoppingCart } from 'lucide-react'
import { EmptyState } from '../components/common/EmptyState'
import { btnPrimary, btnSecondary, inputClass } from '../components/common/ui'
import { CheckoutResult } from '../components/product/CheckoutResult'
import { OrderSummary } from '../components/product/OrderSummary'
import { useCart } from '../context/CartContext'
import { getProduct } from '../data/products'
import { placeCheckoutOrder } from '../services/orders/placeCheckoutOrder'
import type { Order } from '../types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatPrice } from '../utils/format'
import { lineKey } from '../utils/cart'
import { validateCheckout, type CheckoutErrors } from '../utils/checkout'
import { supabaseConfigured } from '../services/supabase'

export default function CheckoutPage() {
  useDocumentTitle('Оформление заказа')
  const { items, clear } = useCart()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [comment, setComment] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [placed, setPlaced] = useState<Order | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  // Синхронная защита от повторной отправки (двойной клик, повторное нажатие Enter до перерисовки)
  const submitting = useRef(false)

  // После создания заказа переводим фокус на заголовок результата — для пользователей клавиатуры и скринридеров
  useEffect(() => {
    if (placed) document.getElementById('checkout-result-title')?.focus()
  }, [placed])

  if (placed) return <CheckoutResult order={placed} />

  if (items.length === 0) {
    return (
      <div className="container-x py-8 sm:py-12">
        <h1 className="mb-6 text-4xl sm:text-5xl">Оформление заказа</h1>
        <EmptyState icon={ShoppingCart} title="Корзина пуста" text="Сначала добавьте товары в корзину.">
          <Link to="/catalog" className={btnPrimary}>
            Перейти в каталог
          </Link>
        </EmptyState>
      </div>
    )
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting.current) return
    setSubmitError(null)
    const found = validateCheckout(name, email, agree, phone, address)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      const firstId = found.name ? 'co-name' : found.phone ? 'co-phone' : found.email ? 'co-email' : found.address ? 'co-address' : 'co-agree'
      formRef.current?.querySelector<HTMLElement>(`#${firstId}`)?.focus()
      return
    }

    submitting.current = true
    setBusy(true)
    try {
      // Сервер проверяет активность вариантов и сам рассчитывает цены и итоговую сумму.
      const result = await placeCheckoutOrder(items, { name, email, phone, address, comment, consent: agree })
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      // Корзину очищаем только после успешного сохранения заказа
      clear()
      setPlaced(result.value)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const errorText = (id: string, message?: string) =>
    message && (
      <p id={id} className="mt-1.5 text-sm font-medium text-red-hot">
        {message}
      </p>
    )

  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="mb-2 text-4xl sm:text-5xl">Оформление заказа</h1>
      {!supabaseConfigured && <p className="mb-6 flex items-start gap-2 border border-red bg-red/10 p-3 text-sm font-semibold">
        <Info className="mt-0.5 size-5 shrink-0 text-red-hot" aria-hidden="true" />
        Supabase не настроен. Реальные заказы временно недоступны.
      </p>}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5 border border-line bg-coal p-5 sm:p-6">
          <h2 className="text-2xl">Контактные данные</h2>

          <div>
            <label htmlFor="co-name" className="mb-1.5 block text-sm font-semibold">Имя</label>
            <input
              id="co-name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'co-name-error' : undefined}
              className={inputClass}
            />
            {errorText('co-name-error', errors.name)}
          </div>

          <div>
            <label htmlFor="co-phone" className="mb-1.5 block text-sm font-semibold">Телефон</label>
            <input id="co-phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(errors.phone)} className={inputClass} />
            {errorText('co-phone-error', errors.phone)}
          </div>
          <div>
            <label htmlFor="co-email" className="mb-1.5 block text-sm font-semibold">Email</label>
            <input
              id="co-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'co-email-error' : undefined}
              className={inputClass}
            />
            {errorText('co-email-error', errors.email)}
          </div>
          <div>
            <label htmlFor="co-address" className="mb-1.5 block text-sm font-semibold">Адрес / способ получения</label>
            <input id="co-address" name="address" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={Boolean(errors.address)} className={inputClass} />
            {errorText('co-address-error', errors.address)}
          </div>
          <div>
            <label htmlFor="co-comment" className="mb-1.5 block text-sm font-semibold">Комментарий</label>
            <textarea id="co-comment" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className={`${inputClass} py-2`} />
          </div>

          <div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                id="co-agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                aria-invalid={Boolean(errors.agree)}
                aria-describedby={errors.agree ? 'co-agree-error' : undefined}
                className="mt-0.5 size-5 shrink-0 accent-red"
              />
              <span className="text-sm text-silver">
                Я ознакомился с{' '}
                <Link to="/terms" className="text-white underline underline-offset-4">условиями использования</Link>,{' '}
                <Link to="/refund-policy" className="text-white underline underline-offset-4">правилами возврата</Link> и{' '}
                <Link to="/privacy" className="text-white underline underline-offset-4">политикой конфиденциальности</Link>.
              </span>
            </label>
            {errorText('co-agree-error', errors.agree)}
          </div>

          <fieldset disabled className="border border-dashed border-line p-4">
            <legend className="px-2 text-sm font-semibold text-silver">Способ оплаты</legend>
            <p className="flex items-center gap-2 text-sm text-silver">
              <CreditCard className="size-5" aria-hidden="true" />
              Способы оплаты не подключены.
            </p>
          </fieldset>

          <p className="flex gap-2 text-xs text-silver">
            <Info className="mt-0.5 size-4 shrink-0 text-red" aria-hidden="true" />
            Заказ отправляется в Supabase. Онлайн-оплата не подключена и при оформлении не выполняется.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" disabled={busy || !supabaseConfigured} aria-busy={busy} className={btnPrimary}>
              {busy ? 'Создаём заказ…' : 'Оформить заказ'}
            </button>
            <Link to="/cart" className={btnSecondary}>
              Вернуться в корзину
            </Link>
          </div>

          {submitError && (
            <div role="alert" className="border border-red bg-red/10 p-4">
              <p className="font-semibold text-white">Заказ не создан</p>
              <p className="mt-1 text-sm text-silver">{submitError} Корзина сохранена — попробуйте ещё раз.</p>
            </div>
          )}
        </form>

        <aside aria-label="Состав заказа" className="space-y-4">
          <ul className="divide-y divide-line border border-line bg-coal">
            {items.map((item) => {
              const p = getProduct(item.productId)
              if (!p) return null
              return (
                <li key={lineKey(item)} className="flex justify-between gap-3 p-3 text-sm">
                  <span className="min-w-0">
                    {p.title}
                    <span className="block text-xs text-silver">
                      {item.quantity} × {formatPrice(p.price, p.currency)}
                      {item.region ? ` · ${item.region}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatPrice(p.price * item.quantity, p.currency)}</span>
                </li>
              )
            })}
          </ul>
          <OrderSummary />
        </aside>
      </div>
    </div>
  )
}
