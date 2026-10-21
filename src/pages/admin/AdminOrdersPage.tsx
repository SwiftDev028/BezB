import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, X } from 'lucide-react'
import { FulfillmentBadge, PaymentBadge } from '../../components/admin/StatusBadge'
import { EmptyState } from '../../components/common/EmptyState'
import { inputClass } from '../../components/common/ui'
import { useOrders } from '../../context/OrdersContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useOrderFilters } from '../../hooks/useOrderFilters'
import type { FulfillmentStatus, OrderSortKey, PaymentStatus } from '../../types'
import { formatDateTime } from '../../utils/formatDate'
import { formatPrice } from '../../utils/format'
import {
  filterOrders,
  fulfillmentLabels,
  fulfillmentStatuses,
  orderSortLabels,
  orderStats,
  paymentLabels,
  paymentStatuses,
} from '../../utils/orders'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-coal p-4">
      <dt className="text-xs uppercase tracking-wider text-silver">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold text-white">{value}</dd>
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">{label}</label>
      {children}
    </div>
  )
}

export default function AdminOrdersPage() {
  useDocumentTitle('Админ: заказы')
  const uid = useId()
  const { orders, loading, loadError } = useOrders()
  const { filters, update, reset } = useOrderFilters()

  const results = useMemo(() => filterOrders(orders, filters), [orders, filters])
  const stats = useMemo(() => orderStats(orders), [orders])
  const id = (n: string) => `${uid}-${n}`

  if (loading) return <p role="status" className="text-silver">Загрузка заказов…</p>
  if (loadError)
    return (
      <p role="alert" className="border border-red p-4 text-red-hot">
        Не удалось загрузить заказы: {loadError}
      </p>
    )

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1 font-display text-sm uppercase tracking-[0.2em] text-red">Админ-панель</p>
          <h1 className="text-4xl sm:text-5xl">Заказы</h1>
        </div>
        <p className="text-sm text-silver">Реальные заказы из Supabase</p>
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Всего заказов" value={stats.total} />
        <Stat label="Ждут оплаты" value={stats.awaitingPayment} />
        <Stat label="Оплачены, к выдаче" value={stats.toFulfil} />
        <Stat label="Выдано" value={stats.delivered} />
      </dl>

      <section aria-label="Поиск, фильтры и сортировка" className="mb-6 grid gap-4 border border-line bg-coal p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2 lg:col-span-2">
          <Field label="Поиск" htmlFor={id('q')}>
            <input id={id('q')} type="search" value={filters.query} onChange={(e) => update({ query: e.target.value })} placeholder="Номер, имя, email, товар" className={inputClass} />
          </Field>
        </div>
        <Field label="Оплата" htmlFor={id('pay')}>
          <select id={id('pay')} value={filters.payment} onChange={(e) => update({ payment: e.target.value as PaymentStatus | 'all' })} className={inputClass}>
            <option value="all">Любая</option>
            {paymentStatuses.map((s) => <option key={s} value={s}>{paymentLabels[s]}</option>)}
          </select>
        </Field>
        <Field label="Выполнение" htmlFor={id('ful')}>
          <select id={id('ful')} value={filters.fulfillment} onChange={(e) => update({ fulfillment: e.target.value as FulfillmentStatus | 'all' })} className={inputClass}>
            <option value="all">Любое</option>
            {fulfillmentStatuses.map((s) => <option key={s} value={s}>{fulfillmentLabels[s]}</option>)}
          </select>
        </Field>
        <Field label="Дата от" htmlFor={id('from')}>
          <input id={id('from')} type="date" value={filters.dateFrom} max={filters.dateTo || undefined} onChange={(e) => update({ dateFrom: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Дата до" htmlFor={id('to')}>
          <input id={id('to')} type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(e) => update({ dateTo: e.target.value })} className={inputClass} />
        </Field>
        <Field label="Сортировка" htmlFor={id('sort')}>
          <select id={id('sort')} value={filters.sort} onChange={(e) => update({ sort: e.target.value as OrderSortKey })} className={inputClass}>
            {Object.entries(orderSortLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <div className="flex items-end lg:col-span-2">
          <button type="button" onClick={reset} className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-line px-4 text-silver hover:border-silver hover:text-white">
            <X className="size-4" aria-hidden="true" />
            Сбросить фильтры
          </button>
        </div>
        <p className="self-end text-sm text-silver" aria-live="polite">
          Найдено: <strong className="text-white">{results.length}</strong> из {orders.length}
        </p>
      </section>

      {results.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={orders.length === 0 ? 'Заказов пока нет' : 'Ничего не найдено'}
          text={orders.length === 0 ? 'Новые заказы появятся после оформления покупателем.' : 'Измените запрос или сбросьте фильтры.'}
        />
      ) : (
        <div>
          <div aria-hidden="true" className="hidden grid-cols-[8rem_1fr_1.2fr_9.5rem_11.5rem_6.5rem] gap-3 border-b border-line px-4 pb-2 text-xs uppercase tracking-wider text-silver lg:grid">
            <span>Заказ</span><span>Покупатель</span><span>Состав</span><span>Оплата</span><span>Выполнение</span><span className="text-right">Сумма</span>
          </div>
          <ul className="divide-y divide-line border border-line bg-coal lg:border-t-0">
            {results.map((o) => (
              <li key={o.id} className="relative grid gap-x-3 gap-y-2 p-4 transition-colors hover:bg-graphite lg:grid-cols-[8rem_1fr_1.2fr_9.5rem_11.5rem_6.5rem] lg:items-center">
                <div>
                  <Link to={`/admin/orders/${o.id}`} className="font-display text-lg uppercase text-white after:absolute after:inset-0 hover:text-red-hot">
                    {o.number}
                  </Link>
                  <p className="text-xs text-silver">{formatDateTime(o.createdAt)}</p>
                  {o.source === 'checkout' && <p className="text-xs font-semibold text-red-hot">С сайта</p>}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{o.customer.name}</p>
                  <p className="truncate text-xs text-silver">{o.customer.email}</p>
                </div>
                <p className="min-w-0 truncate text-sm text-silver">
                  {o.items.map((i) => `${i.title}${i.quantity > 1 ? ` × ${i.quantity}` : ''}`).join(', ')}
                </p>
                <div><PaymentBadge status={o.paymentStatus} /></div>
                <div><FulfillmentBadge status={o.fulfillmentStatus} /></div>
                <p className="font-display text-xl font-bold lg:text-right">{formatPrice(o.total, o.currency)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
