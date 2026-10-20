import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, Info, ShoppingCart } from 'lucide-react'
import { EmptyState } from '../components/common/EmptyState'
import { btnPrimary, btnSecondary, inputClass } from '../components/common/ui'
import { OrderSummary } from '../components/product/OrderSummary'
import { useCart } from '../context/CartContext'
import { getProduct } from '../data/products'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatPrice } from '../utils/format'
import { lineKey } from '../utils/cart'
import { validateCheckout, type CheckoutErrors } from '../utils/checkout'

export default function CheckoutPage() {
  useDocumentTitle('Оформление заказа')
  const { items } = useCart()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [agree, setAgree] = useState(false)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const found = validateCheckout(name, email, agree)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setSubmitted(false)
      const firstId = found.name ? 'co-name' : found.email ? 'co-email' : 'co-agree'
      formRef.current?.querySelector<HTMLElement>(`#${firstId}`)?.focus()
      return
    }
    // Данные никуда не отправляются: бэкенда и оплаты пока нет.
    setSubmitted(true)
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
      <p className="mb-6 flex items-start gap-2 border border-red bg-red/10 p-3 text-sm font-semibold">
        <Info className="mt-0.5 size-5 shrink-0 text-red-hot" aria-hidden="true" />
        Демонстрационный режим. Оплата пока не подключена.
      </p>

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

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="submit" className={btnPrimary}>
              Оформить заказ
            </button>
            <Link to="/cart" className={btnSecondary}>
              Вернуться в корзину
            </Link>
          </div>

          {submitted && (
            <div role="status" className="border border-line bg-graphite p-4">
              <p className="font-semibold text-white">Оформление заказа находится в разработке.</p>
              <p className="mt-1 text-sm text-silver">
                Заказ не создан, оплата не выполнена, введённые данные никуда не отправлены. Корзина сохранена.
              </p>
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
