import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { FulfillmentStatus, ManualDelivery, ManualDeliveryInput, OrderItem, PaymentStatus } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { btnPrimary, btnSecondary, inputClass } from '../common/ui'

type Props = {
  orderId: string
  orderItems: OrderItem[]
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  deliveries: ManualDelivery[]
  inventoryDeliveredCounts: Record<string, number>
  inventoryReservedCounts: Record<string, number>
  busy: boolean
  onIssue: (requestKey: string, deliveries: ManualDeliveryInput[]) => Promise<boolean>
  onUpdate: (deliveryId: string, revision: number, delivery: ManualDeliveryInput) => Promise<boolean>
  onResend: (deliveryId: string) => Promise<void>
}

type Slot =
  | { kind: 'manual'; key: string; item: OrderItem; number: number; delivery: ManualDelivery }
  | { kind: 'inventory-delivered' | 'inventory-reserved' | 'pending'; key: string; item: OrderItem; number: number }

const fields = [
  ['title', 'Название товара'],
  ['activationCode', 'Ключ / код активации'],
  ['login', 'Логин'],
  ['password', 'Пароль'],
  ['additionalData', 'Дополнительные данные'],
  ['instructions', 'Инструкция по активации'],
] as const

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

function deliveryInput(delivery: ManualDelivery): ManualDeliveryInput {
  return {
    orderItemId: delivery.orderItemId,
    title: delivery.title,
    activationCode: delivery.activationCode,
    login: delivery.login,
    password: delivery.password,
    additionalData: delivery.additionalData,
    instructions: delivery.instructions,
  }
}

function isReady(entry: ManualDeliveryInput): boolean {
  return Boolean(entry.orderItemId && entry.title.trim()
    && (entry.activationCode.trim() || entry.login.trim() || entry.password.trim() || entry.additionalData.trim()))
}

function DeliveryFields({
  entry,
  label,
  copyable = false,
  onChange,
}: {
  entry: ManualDeliveryInput
  label: string
  copyable?: boolean
  onChange: (field: keyof ManualDeliveryInput, value: string) => void
}) {
  const [copied, setCopied] = useState('')
  const [copyError, setCopyError] = useState('')
  return (
    <div className="space-y-3">
      {fields.map(([field, title]) => (
        <label key={field} className="block text-xs font-semibold text-silver">
          {title}
          <textarea
            aria-label={`${title} · ${label}`}
            className={`${inputClass} mt-1 py-2`}
            rows={field === 'instructions' || field === 'additionalData' ? 3 : 1}
            value={entry[field]}
            required={field === 'title'}
            onChange={(event) => onChange(field, event.target.value)}
          />
          {copyable && entry[field] && (
            <button
              type="button"
              className="mt-1 text-xs underline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(entry[field])
                  setCopied(field)
                  setCopyError('')
                } catch {
                  setCopyError('Не удалось скопировать значение.')
                }
              }}
            >
              Копировать {title.toLowerCase()}
            </button>
          )}
          {copied === field && <span role="status" className="ml-2 text-xs">Скопировано</span>}
        </label>
      ))}
      {copyError && <p role="alert" className="text-xs text-red-hot">{copyError}</p>}
    </div>
  )
}

function DeliveryCard({
  orderId,
  slot,
  paymentStatus,
  fulfillmentStatus,
  busy,
  onIssue,
  onUpdate,
  onResend,
}: {
  orderId: string
  slot: Slot
  paymentStatus: PaymentStatus
  fulfillmentStatus: FulfillmentStatus
  busy: boolean
  onIssue: Props['onIssue']
  onUpdate: Props['onUpdate']
  onResend: Props['onResend']
}) {
  const existing = slot.kind === 'manual' ? slot.delivery : null
  const [entry, setEntry] = useState<ManualDeliveryInput>(() =>
    existing ? deliveryInput(existing) : blankDelivery(slot.item),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const requestKey = useRef<string | null>(null)
  const working = busy || saving
  const label = `${slot.item.title} · единица ${slot.number}`
  const mayIssue = paymentStatus === 'paid' && fulfillmentStatus !== 'delivered' && fulfillmentStatus !== 'cancelled'

  useEffect(() => {
    if (existing) setEntry(deliveryInput(existing))
  }, [existing?.revision])

  const change = (field: keyof ManualDeliveryInput, value: string) => {
    setEntry((current) => ({ ...current, [field]: value }))
    setError('')
  }

  if (slot.kind === 'inventory-delivered' || slot.kind === 'inventory-reserved') {
    return (
      <article className="space-y-2 border border-line bg-ink p-4">
        <h3 className="font-semibold">{label}</h3>
        <p role="status" className="text-sm text-silver">
          {slot.kind === 'inventory-delivered' ? 'Выдано со склада' : 'Назначено со склада · ожидает выдачи'}
        </p>
        <p className="text-xs text-silver">Управление складским кодом доступно в блоке «Коды со склада».</p>
      </article>
    )
  }

  if (existing) {
    const save = async (event: FormEvent) => {
      event.preventDefault()
      if (working || !isReady(entry)) return
      setSaving(true)
      setError('')
      try {
        if (!await onUpdate(existing.id, existing.revision, { ...entry })) {
          setError('Не удалось сохранить изменения. Проверьте сообщение выше и повторите попытку.')
        }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить изменения.')
      } finally {
        setSaving(false)
      }
    }

    return (
      <article className="space-y-4 border border-line bg-ink p-4" aria-label={`Выдача: ${label}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{label}</h3>
            <p className="mt-1 text-xs text-silver">Статус: выдан · версия {existing.revision}</p>
            <p className="text-xs text-silver">Изменено {formatDateTime(existing.updatedAt)}</p>
          </div>
          <time className="text-xs text-silver">Выдано {formatDateTime(existing.createdAt)}</time>
        </div>
        <form onSubmit={(event) => void save(event)} className="space-y-3">
          <DeliveryFields entry={entry} label={label} copyable onChange={change} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={btnPrimary} disabled={working || !isReady(entry)}>
              {saving ? 'Сохраняем…' : 'Сохранить изменения'}
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={working || fulfillmentStatus === 'cancelled'}
              onClick={() => {
                if (window.confirm('Повторно отправить актуальные данные товара в чат?')) {
                  void onResend(existing.id)
                }
              }}
            >
              Повторно отправить
            </button>
          </div>
        </form>
        {existing.history.length > 0 && (
          <details className="border-t border-line pt-3">
            <summary className="cursor-pointer text-xs text-silver">История изменений ({existing.history.length})</summary>
            <ul className="mt-2 space-y-2 text-xs text-silver">
              {existing.history.map((changeRecord) => (
                <li key={changeRecord.revision}>
                  Версия {changeRecord.revision} · {formatDateTime(changeRecord.changedAt)} · изменены поля: {changeRecord.changedFields.join(', ')}
                </li>
              ))}
            </ul>
          </details>
        )}
        {error && <p role="alert" className="text-sm text-red-hot">{error}</p>}
      </article>
    )
  }

  const issue = async (event: FormEvent) => {
    event.preventDefault()
    if (working || !mayIssue || !isReady(entry)) return
    if (!window.confirm(`Выдать «${entry.title}» покупателю и отправить данные в чат заказа ${orderId}?`)) return

    const storageKey = `bezb:manual-delivery-request:${orderId}:${slot.item.id}:${slot.number}`
    try {
      requestKey.current ??= sessionStorage.getItem(storageKey)
      if (!requestKey.current || !/^[0-9a-f-]{36}$/i.test(requestKey.current)) {
        requestKey.current = crypto.randomUUID()
      }
      sessionStorage.setItem(storageKey, requestKey.current)
    } catch {
      setError('Не удалось сохранить ключ повтора. Разрешите хранилище сессии и повторите попытку.')
      return
    }

    setSaving(true)
    setError('')
    try {
      if (await onIssue(requestKey.current, [{ ...entry }])) {
        try {
          sessionStorage.removeItem(storageKey)
        } catch {
          setError('Выдача состоялась, но ключ повтора остался в хранилище текущей сессии.')
        }
        requestKey.current = null
      }
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'Не удалось выдать товар.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="space-y-4 border border-line bg-ink p-4" aria-label={`Ожидает выдачи: ${label}`}>
      <div>
        <h3 className="font-semibold">{label}</h3>
        <p className="mt-1 text-xs text-silver">Статус: ожидает выдачи</p>
      </div>
      {paymentStatus !== 'paid' && <p className="text-xs text-silver">Для выдачи нужно подтвердить оплату заказа.</p>}
      <form onSubmit={(event) => void issue(event)} className="space-y-3">
        <DeliveryFields entry={entry} label={label} onChange={change} />
        <button type="submit" className={btnPrimary} disabled={!mayIssue || working || !isReady(entry)}>
          {saving ? 'Сохраняем и отправляем…' : 'Выдать покупателю'}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-red-hot">{error}</p>}
    </article>
  )
}

function deliverySlots({
  orderId,
  orderItems,
  deliveries,
  inventoryDeliveredCounts,
  inventoryReservedCounts,
}: Pick<Props, 'orderId' | 'orderItems' | 'deliveries' | 'inventoryDeliveredCounts' | 'inventoryReservedCounts'>): Slot[] {
  return orderItems.flatMap((item) => {
    const itemId = item.id ?? ''
    const manual = deliveries
      .filter((delivery) => delivery.orderItemId === itemId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    const deliveredCount = inventoryDeliveredCounts[itemId] ?? 0
    const reservedCount = inventoryReservedCounts[itemId] ?? 0
    return Array.from({ length: item.quantity }, (_, index): Slot => {
      const number = index + 1
      const key = `${orderId}:${itemId}:${number}`
      if (index < deliveredCount) return { kind: 'inventory-delivered', key, item, number }
      const manualIndex = index - deliveredCount
      if (manualIndex < manual.length) {
        return { kind: 'manual', key, item, number, delivery: manual[manualIndex] }
      }
      if (manualIndex < manual.length + reservedCount) return { kind: 'inventory-reserved', key, item, number }
      return { kind: 'pending', key, item, number }
    })
  })
}

export function ManualDeliveryPanel(props: Props) {
  const slots = deliverySlots(props)
  const deliveredCount = slots.filter((slot) => slot.kind === 'manual' || slot.kind === 'inventory-delivered').length
  return (
    <section aria-labelledby="manual-delivery" className="space-y-4 border border-line bg-coal p-4">
      <div>
        <h2 id="manual-delivery" className="text-2xl">Выдача товаров по позициям заказа</h2>
        <p className="mt-1 text-sm text-silver">Каждая единица выдаётся и редактируется отдельно. Изменения версии появятся у покупателя в том же чате.</p>
      </div>
      {props.orderItems.length === 0 ? (
        <p className="text-sm text-silver">В заказе нет позиций для выдачи.</p>
      ) : (
        <>
          <p className="text-xs text-silver">Выдано {deliveredCount} из {slots.length} единиц.</p>
          <div className="space-y-3">
            {slots.map((slot) => (
              <DeliveryCard
                key={slot.key}
                orderId={props.orderId}
                slot={slot}
                paymentStatus={props.paymentStatus}
                fulfillmentStatus={props.fulfillmentStatus}
                busy={props.busy}
                onIssue={props.onIssue}
                onUpdate={props.onUpdate}
                onResend={props.onResend}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
