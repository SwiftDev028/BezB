import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { FulfillmentStatus, OrderFilters, OrderSortKey, PaymentStatus } from '../types'
import { defaultOrderFilters, fulfillmentStatuses, orderSortLabels, paymentStatuses } from '../utils/orders'

const sortKeys = Object.keys(orderSortLabels) as OrderSortKey[]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Фильтры списка заказов хранятся в адресной строке, как и в каталоге. */
export function useOrderFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo<OrderFilters>(() => {
    const pay = params.get('pay')
    const ful = params.get('ful')
    const sort = params.get('sort')
    const from = params.get('from') ?? ''
    const to = params.get('to') ?? ''
    return {
      query: params.get('q') ?? '',
      payment: paymentStatuses.includes(pay as PaymentStatus) ? (pay as PaymentStatus) : 'all',
      fulfillment: fulfillmentStatuses.includes(ful as FulfillmentStatus) ? (ful as FulfillmentStatus) : 'all',
      dateFrom: DATE_RE.test(from) ? from : '',
      dateTo: DATE_RE.test(to) ? to : '',
      sort: sortKeys.includes(sort as OrderSortKey) ? (sort as OrderSortKey) : defaultOrderFilters.sort,
    }
  }, [params])

  const update = useCallback(
    (patch: Partial<OrderFilters>) => {
      const f = { ...filters, ...patch }
      const next = new URLSearchParams()
      if (f.query.trim()) next.set('q', f.query)
      if (f.payment !== 'all') next.set('pay', f.payment)
      if (f.fulfillment !== 'all') next.set('ful', f.fulfillment)
      if (f.dateFrom) next.set('from', f.dateFrom)
      if (f.dateTo) next.set('to', f.dateTo)
      if (f.sort !== defaultOrderFilters.sort) next.set('sort', f.sort)
      setParams(next, { replace: true })
    },
    [filters, setParams],
  )

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])
  return { filters, update, reset }
}
