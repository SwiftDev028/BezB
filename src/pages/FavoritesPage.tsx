import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { EmptyState } from '../components/common/EmptyState'
import { btnPrimary } from '../components/common/ui'
import { ProductGrid } from '../components/product/ProductGrid'
import { useFavorites } from '../context/FavoritesContext'
import { useCatalog } from '../context/CatalogContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { Product } from '../types'

export default function FavoritesPage() {
  useDocumentTitle('Избранное')
  const { ids } = useFavorites()
  const { getProduct } = useCatalog()
  const items = ids.map(getProduct).filter((p): p is Product => Boolean(p))

  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="mb-6 text-4xl sm:text-5xl">Избранное</h1>
      {items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="В избранном пока пусто"
          text="Нажмите на сердечко у товара, чтобы сохранить его здесь."
        >
          <Link to="/catalog" className={btnPrimary}>
            Перейти в каталог
          </Link>
        </EmptyState>
      ) : (
        <ProductGrid products={items} />
      )}
    </div>
  )
}
