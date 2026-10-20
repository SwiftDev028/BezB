import type { Product } from '../../types'
import { discountPercent, formatPrice } from '../../utils/format'

export function Price({ product, large = false }: { product: Product; large?: boolean }) {
  const discount = discountPercent(product.price, product.oldPrice)
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`font-display font-bold text-white ${large ? 'text-4xl' : 'text-xl sm:text-2xl'}`}>
        {formatPrice(product.price, product.currency)}
      </span>
      {product.oldPrice && discount !== null && (
        <>
          <s className="text-sm text-silver">{formatPrice(product.oldPrice, product.currency)}</s>
          <span className="sr-only">скидка {discount}%</span>
        </>
      )}
    </div>
  )
}
