import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ManualDelivery, ManualDeliveryInput, OrderItem, PaymentStatus, FulfillmentStatus } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { btnPrimary, btnSecondary, inputClass } from '../common/ui'

type Props = {
  orderId: string
  orderItems: OrderItem[]
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  deliveries: ManualDelivery[]
  inventoryDeliveredCounts: Record<string, number>
  busy: boolean
  onIssue: (requestKey: string, deliveries: ManualDeliveryInput[]) => Promise<boolean>
  onResend: (deliveryId: string) => Promise<void>
}

function blankDelivery(item: OrderItem): ManualDeliveryInput {
  return {
    orderItemId: item.id ?? '',
    title: item.title,
    activationCode: '',
    login: '',
    password: '',
    additionalData: '',
    instructions: '',
  }
}

function CopyField({ label, value }: {
  label: string
  value: string
}) {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'error' | null>(null)
  if (!value) return null
  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="min-w-20 text-silver">{label}:</span>
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all">{value}</code>
      <button
        type="button"
        className="text-xs underline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopyStatus('copied')
          } catch {
            setCopyStatus('error')
          }
        }}
      >
        Копировать {label.toLowerCase()}
      </button>
      {copyStatus && (
        <span role={copyStatus === 'error' ? 'alert' : 'status'} className="text-xs text-silver">
          {copyStatus === 'copied' ? 'Скопировано' : 'Не удалось скопировать значение.'}
        </span>
      )}
    </div>
  )
}

export function ManualDeliveryPanel({
  orderId,
  orderItems,
  paymentStatus,
  fulfillmentStatus,
  deliveries,
  inventoryDeliveredCounts,
  busy,
  onIssue,
  onResend,
}: Props) {
  const [entries, setEntries] = useState<ManualDeliveryInput[]>(() =>
    orderItems.length > 0 ? [blankDelivery(orderItems[0])] : [],
  )
  const [requestError, setRequestError] = useState('')
  const requestKey = useRef<string | null>(null)
  const issuing = useRef(false)
  const disabled = paymentStatus !== 'paid' || fulfillmentStatus === 'delivered' || fulfillmentStatus === 'cancelled'

  useEffect(() => {
    requestKey.current = null
    setRequestError('')
    setEntries(orderItems.length > 0 ? [blankDelivery(orderItems[0])] : [])
  }, [orderId, orderItems])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || issuing.current || disabled || entries.length === 0) return
    const ready = entries.every((entry) =>
      entry.orderItemId && entry.title.trim()
      && (entry.activationCode.trim() || entry.login.trim() || entry.password.trim() || entry.additionalData.trim()),
    )
    if (!ready) return
    const confirmed = window.confirm(
      `Выдать ${entries.length} поз. покупателю? Данные будут сохранены и отправлены в чат заказа ${orderId}.`,
    )
    if (!confirmed) return
    const storageKey = `bezb:manual-delivery-request:${orderId}`
    try {
      requestKey.current ??= sessionStorage.getItem(storageKey)
      if (!requestKey.current || !/^[0-9a-f-]{36}$/i.test(requestKey.current)) {
        requestKey.current = crypto.randomUUID()
      }
      sessionStorage.setItem(storageKey, requestKey.current)
    } catch {
      setRequestError('Не удалось безопасно сохранить ключ повтора. Разрешите хранилище сессии и повторите попытку.')
      return
    }
    issuing.current = true
    try {
      if (await onIssue(requestKey.current, entries.map((entry) => ({ ...entry })))) {
        try {
          sessionStorage.removeItem(storageKey)
        } catch {
          setRequestError('Выдача состоялась, но ключ повтора остался в хранилище текущей сессии.')
        }
        requestKey.current = null
        setEntries(orderItems.length > 0 ? [blankDelivery(orderItems[0])] : [])
      }
    } finally {
      issuing.current = false
    }
  }

  return (
    <section aria-labelledby="manual-delivery" className="space-y-4 border border-line bg-coal p-4">
      <div>
        <h2 id="manual-delivery" className="text-2xl">Ручная выдача покупателю</h2>
        <p className="mt-1 text-sm text-silver">Данные хранятся в закрытой схеме и попадут покупателю через защищённый чат.</p>
      </div>

      {paymentStatus !== 'paid' && <p className="text-sm text-silver">Перед выдачей подтвердите оплату.</p>}
      {fulfillmentStatus === 'cancelled' && <p className="text-sm text-silver">Нельзя выдавать товар по отменённому заказу.</p>}

      {deliveries.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold">Уже выдано</h3>
          {deliveries.map((delivery) => (
            <article key={delivery.id} className="space-y-2 border-t border-line pt-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{delivery.title}</strong>
                <time className="text-xs text-silver">{formatDateTime(delivery.createdAt)}</time>
              </div>
              <CopyField label="Код" value={delivery.activationCode} />
              <CopyField label="Логин" value={delivery.login} />
              <CopyField label="Пароль" value={delivery.password} />
              <CopyField label="Дополнительно" value={delivery.additionalData} />
              <CopyField label="Инструкция" value={delivery.instructions} />
              <button
                type="button"
                className="text-sm underline"
                disabled={busy || fulfillmentStatus === 'cancelled'}
                onClick={() => {
                  if (window.confirm('Повторно отправить этот товар в чат? Новая выдача создана не будет.')) {
                    void onResend(delivery.id)
                  }
                }}
              >
                Повторно отправить в чат
              </button>
            </article>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {orderItems.map((item) => {
          const issued = (inventoryDeliveredCounts[item.id ?? ''] ?? 0)
            + deliveries.filter((delivery) => delivery.orderItemId === item.id).length
          return (
            <p key={`progress-${item.id}`} className="text-xs text-silver">
              {item.title}: {issued}/{item.quantity} шт. выдано
            </p>
          )
        })}
      </div>

      {fulfillmentStatus !== 'delivered' && fulfillmentStatus !== 'cancelled' && (
        <form onSubmit={(event) => void submit(event)} className="space-y-4 border-t border-line pt-4">
          {entries.map((entry, index) => (
            <fieldset key={`${orderId}-${index}`} disabled={disabled || busy} className="space-y-3 border border-line p-3">
              <legend className="px-1 text-sm font-semibold">Товар {index + 1}</legend>
              <label className="block text-xs font-semibold text-silver">
                Позиция заказа
                <select
                  aria-label={`Позиция заказа ${index + 1}`}
                  className={`${inputClass} mt-1`}
                  value={entry.orderItemId}
                  onChange={(event) => {
                    const selectedItem = orderItems.find((item) => item.id === event.target.value)
                    setEntries((current) => current.map((item, currentIndex) => currentIndex === index
                      ? { ...item, orderItemId: event.target.value, title: selectedItem?.title ?? item.title }
                      : item))
                  }}
                  required
                >
                  {orderItems.map((item) => (
                    <option key={item.id} value={item.id}>{item.title} · {item.quantity} шт.</option>
                  ))}
                </select>
              </label>
              {([
                ['title', 'Название товара', true],
                ['activationCode', 'Ключ / код активации', false],
                ['login', 'Логин', false],
                ['password', 'Пароль', false],
                ['additionalData', 'Дополнительные данные', false],
                ['instructions', 'Инструкция по активации', false],
              ] as const).map(([field, label, required]) => (
                <label key={field} className="block text-xs font-semibold text-silver">
                  {label}
                  <textarea
                    aria-label={`${label} ${index + 1}`}
                    className={`${inputClass} mt-1 py-2`}
                    rows={field === 'instructions' || field === 'additionalData' ? 3 : 1}
                    value={entry[field]}
                    required={required}
                    onChange={(event) => setEntries((current) => current.map((item, currentIndex) =>
                      currentIndex === index ? { ...item, [field]: event.target.value } : item,
                    ))}
                  />
                </label>
              ))}
              {entries.length > 1 && (
                <button
                  type="button"
                  className="text-sm text-silver underline"
                  onClick={() => setEntries((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                >
                  Удалить позицию
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className={btnSecondary}
            disabled={disabled || busy || entries.length >= 50 || orderItems.length === 0}
            onClick={() => setEntries((current) => [...current, blankDelivery(orderItems[0])])}
          >
            Добавить товар или ключ
          </button>
          <button
            type="submit"
            className={btnPrimary}
            disabled={disabled || busy || entries.length === 0 || !entries.every((entry) =>
              entry.orderItemId && entry.title.trim()
              && (entry.activationCode.trim() || entry.login.trim() || entry.password.trim() || entry.additionalData.trim()),
            )}
          >
            {busy ? 'Сохраняем и отправляем…' : 'Выдать покупателю'}
          </button>
          {requestError && <p role="alert" className="text-sm text-red-hot">{requestError}</p>}
        </form>
      )}
    </section>
  )
}
