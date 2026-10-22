import { useMemo } from 'react'
import { SearchX } from 'lucide-react'
import type { CatalogFilters, Category } from '../../types'
import { useCatalog } from '../../context/CatalogContext'
import { useCatalogFilters } from '../../hooks/useCatalogFilters'
import { filterProducts } from '../../utils/catalog'
import { activeFilters, buildFacets, priceBounds as getPriceBounds, sanitizeFilters } from '../../utils/facets'
import { EmptyState } from '../common/EmptyState'
import { btnSecondary } from '../common/ui'
import { ProductFilters } from './ProductFilters'
import { ProductGrid } from './ProductGrid'

interface CatalogBrowserProps {
  category?: Category
  showSearch?: boolean
  emptyTitle?: string
}

/** Фильтры + сетка + состояния пустого результата. Общий для каталога, категорий и поиска. */
export function CatalogBrowser({ category, showSearch = false, emptyTitle = 'Ничего не найдено' }: CatalogBrowserProps) {
  const { products, loading, error, refresh } = useCatalog()
  const { filters: urlFilters, view, update, setView, reset } = useCatalogFilters(category?.id)
  const scopeId = category?.id ?? 'all'

  // Значения, которых нет в ассортименте (например, номинал другого региона из старой ссылки), не применяем.
  // Пока каталог не загружен, фильтры не трогаем: иначе ссылка потеряла бы выбор до прихода данных.
  const filters = useMemo(() => sanitizeFilters(products, urlFilters, scopeId), [products, urlFilters, scopeId])
  const facets = useMemo(() => buildFacets(products, filters, scopeId), [products, filters, scopeId])
  const priceBounds = useMemo(() => getPriceBounds(products, filters), [products, filters])
  const active = useMemo(() => activeFilters(filters, facets, { query: showSearch }), [filters, facets, showSearch])
  // products — в зависимостях: после обновления страницы данные приходят позже первого рендера
  const results = useMemo(() => filterProducts(products, filters), [products, filters])

  // После смены одного фильтра зависимые (номинал при смене региона) приводим в порядок сразу, в URL
  const onChange = (patch: Partial<CatalogFilters>) => update(sanitizeFilters(products, { ...filters, ...patch }, scopeId))

  return (
    <>
      <ProductFilters
        filters={filters}
        view={view}
        facets={facets}
        priceBounds={priceBounds}
        active={active}
        showSearch={showSearch}
        resultCount={loading || error ? null : results.length}
        onChange={onChange}
        onViewChange={setView}
        onReset={reset}
      />
      {loading ? <p role="status" className="py-8 text-silver">Загружаем каталог…</p> : error ? (
        <div role="alert" className="flex flex-col items-start gap-3 border border-red p-4 text-silver">
          <p>Не удалось загрузить каталог: {error}</p>
          <button type="button" onClick={() => void refresh()} className={btnSecondary}>
            Повторить
          </button>
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={products.length === 0 ? 'Товары скоро появятся' : emptyTitle}
          text={products.length === 0 ? 'Каталог пополняется проверенными товарами.' : 'Попробуйте изменить запрос или сбросить фильтры.'}
        >
          <button type="button" onClick={reset} className={btnSecondary}>
            Сбросить фильтры
          </button>
        </EmptyState>
      ) : (
        <ProductGrid products={results} layout={view} />
      )}
    </>
  )
}
