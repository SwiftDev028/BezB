import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { CatalogFilters, CategoryId } from '../types'
import { filtersFromParams, filtersToParams } from '../utils/filterParams'

export type CatalogView = 'grid' | 'list'

/** Фильтры каталога живут в адресной строке: ссылкой можно поделиться, «Назад» работает. */
export function useCatalogFilters(fixedCategory?: CategoryId) {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => filtersFromParams(params, fixedCategory), [params, fixedCategory])
  const view: CatalogView = params.get('view') === 'list' ? 'list' : 'grid'

  const update = useCallback(
    (patch: Partial<CatalogFilters>) => {
      const next = filtersToParams({ ...filters, ...patch }, fixedCategory)
      if (view === 'list') next.set('view', 'list')
      setParams(next, { replace: true })
    },
    [filters, fixedCategory, view, setParams],
  )

  const setView = useCallback(
    (nextView: CatalogView) => {
      const next = filtersToParams(filters, fixedCategory)
      if (nextView === 'list') next.set('view', 'list')
      setParams(next, { replace: true })
    },
    [filters, fixedCategory, setParams],
  )

  const reset = useCallback(() => {
    const next = new URLSearchParams()
    if (view === 'list') next.set('view', 'list')
    setParams(next, { replace: true })
  }, [view, setParams])

  return { filters, view, update, setView, reset }
}
