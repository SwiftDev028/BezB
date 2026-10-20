import type { Product } from '../../types'
import { ProductCard } from './ProductCard'

interface ProductGridProps {
  products: Product[]
  layout?: 'grid' | 'list'
}

export function ProductGrid({ products, layout = 'grid' }: ProductGridProps) {
  return (
    <ul
      className={
        layout === 'list'
          ? 'grid grid-cols-1 gap-3'
          : 'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4'
      }
    >
      {products.map((p) => (
        <li key={p.id} className="min-w-0">
          <ProductCard product={p} layout={layout} />
        </li>
      ))}
    </ul>
  )
}
