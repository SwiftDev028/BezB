import { useMemo } from 'react'
import { SearchX } from 'lucide-react'
import type { Category } from '../../types'
import { products } from '../../data/products'
import { useCatalogFilters } from '../../hooks/useCatalogFilters'
import { filterProducts, uniquePlatforms } from '../../utils/catalog'
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
  const { filters, view, update, setView, reset } = useCatalogFilters(category?.id)

  const scope = useMemo(
    () => (category ? products.filter((p) => p.category === category.id) : products),
    [category],
  )
  const platforms = useMemo(() => uniquePlatforms(scope), [scope])
  const results = useMemo(() => filterProducts(products, filters), [filters])

  return (
    <>
      <ProductFilters
        filters={filters}
        view={view}
        platforms={platforms}
        fixedCategory={category}
        showSearch={showSearch}
        resultCount={results.length}
        onChange={update}
        onViewChange={setView}
        onReset={reset}
      />
      {results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={emptyTitle}
          text="Попробуйте изменить запрос или сбросить фильтры."
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
