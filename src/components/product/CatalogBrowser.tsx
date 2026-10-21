import { useMemo } from 'react'
import { SearchX } from 'lucide-react'
import type { Category } from '../../types'
import { useCatalog } from '../../context/CatalogContext'
import { useCatalogFilters } from '../../hooks/useCatalogFilters'
import { filterProducts } from '../../utils/catalog'
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
  const { products, loading, error } = useCatalog()
  const { filters, view, update, setView, reset } = useCatalogFilters(category?.id)

  const scope = useMemo(() => {
    const selectedCategory = category?.id ?? filters.category
    return selectedCategory === 'all' ? products : products.filter((p) => p.category === selectedCategory)
  }, [category, filters.category, products])
  const results = useMemo(() => filterProducts(products, filters), [filters])

  return (
    <>
      <ProductFilters
        filters={filters}
        view={view}
        products={scope}
        fixedCategory={category}
        showSearch={showSearch}
        loading={loading}
        hasError={Boolean(error)}
        resultCount={results.length}
        onChange={update}
        onViewChange={setView}
        onReset={reset}
      />
      {loading ? <p role="status" className="py-8 text-silver">Загружаем каталог…</p> : error ? (
        <p role="alert" className="border border-red p-4 text-silver">Не удалось загрузить каталог: {error}</p>
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
