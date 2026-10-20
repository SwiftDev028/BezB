import { Link } from 'react-router-dom'
import type { Product } from '../../types'
import { typeLabels } from '../../data/categories'
import { ProductArt } from '../common/ProductArt'
import { btnPrimary, btnSecondary } from '../common/ui'
import { AddToCartButton } from './AddToCartButton'
import { Badge } from './Badge'
import { FavoriteButton } from './FavoriteButton'
import { Price } from './Price'

interface ProductCardProps {
  product: Product
  layout?: 'grid' | 'list'
}

export function ProductCard({ product, layout = 'grid' }: ProductCardProps) {
  const isList = layout === 'list'
  const href = `/product/${product.slug}`
  // Регион выбирается на странице товара — молча подставлять его нельзя
  const needsRegion = Boolean(product.regions?.length)

  return (
    <article
      className={`group relative flex overflow-hidden border border-line bg-coal transition-colors hover:border-red ${
        isList ? 'flex-col sm:flex-row' : 'flex-col'
      }`}
    >
      <div className={`relative ${isList ? 'sm:w-64 sm:shrink-0' : ''}`}>
        <Link to={href} tabIndex={-1} aria-hidden="true" className="block">
          <ProductArt category={product.category} type={product.type} label={product.platform} />
        </Link>
        {product.badge && (
          <div className="absolute left-2 top-2">
            <Badge badge={product.badge} />
          </div>
        )}
        <FavoriteButton productId={product.id} title={product.title} className="absolute right-1 top-1" />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-wider text-silver">
            {product.platform} · {typeLabels[product.type]}
          </p>
          <h3 className="mt-1 text-lg normal-case leading-tight sm:text-xl">
            <Link to={href} className="hover:text-red-hot">
              {product.title}
            </Link>
          </h3>
          {isList && <p className="mt-2 hidden max-w-xl text-sm text-silver sm:block">{product.description}</p>}
        </div>

        <Price product={product} />

        <div className={`flex gap-2 ${isList ? 'flex-col sm:flex-row' : 'flex-col min-[480px]:flex-row'}`}>
          {needsRegion && product.available ? (
            <Link to={href} className={`${btnPrimary} flex-1`}>
              Выбрать регион
            </Link>
          ) : (
            <AddToCartButton
              productId={product.id}
              title={product.title}
              available={product.available}
              className="flex-1"
            />
          )}
          <Link to={href} className={`${btnSecondary} flex-1`}>
            Подробнее
          </Link>
        </div>
      </div>
    </article>
  )
}
