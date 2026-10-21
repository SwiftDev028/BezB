import { Link } from 'react-router-dom'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { EmptyState } from '../components/common/EmptyState'
import { ProductArt } from '../components/common/ProductArt'
import { btnPrimary } from '../components/common/ui'
import { OrderSummary } from '../components/product/OrderSummary'
import { useCart } from '../context/CartContext'
import { useCatalog } from '../context/CatalogContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { MAX_QUANTITY, lineKey } from '../utils/cart'
import { formatPrice } from '../utils/format'

export default function CartPage() {
  useDocumentTitle('Корзина')
  const { items, remove, changeQuantity, clear } = useCart()
  const { getProduct } = useCatalog()

  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="mb-6 text-4xl sm:text-5xl">Корзина</h1>

      {items.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Корзина пуста" text="Добавьте товары из каталога.">
          <Link to="/catalog" className={btnPrimary}>
            Перейти в каталог
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <div>
            <ul className="divide-y divide-line border border-line bg-coal">
              {items.map((item) => {
                const product = getProduct(item.productId, item.region ?? '')
                if (!product) return null
                const key = lineKey(item)
                return (
                  <li key={key} className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-3 p-3 sm:grid-cols-[8rem_1fr_auto] sm:p-4">
                    <Link to={`/product/${product.slug}`} aria-label={product.title} className="row-span-1">
                      <ProductArt category={product.category} type={product.type} imageUrl={product.imageUrl} />
                    </Link>
                    <div className="min-w-0">
                      <Link to={`/product/${product.slug}`} className="font-display text-lg uppercase leading-tight hover:text-red-hot">
                        {product.title}
                      </Link>
                      <p className="mt-1 text-sm text-silver">
                        {product.platform}
                        {item.region ? ` · регион: ${item.region}` : ''}
                      </p>
                      <p className="mt-1 text-sm text-silver">{formatPrice(product.price, product.currency)} за шт.</p>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between">
                      <div className="flex items-center border border-line" role="group" aria-label={`Количество: ${product.title}`}>
                        <button
                          type="button"
                          onClick={() => changeQuantity(key, item.quantity - 1)}
                          aria-label="Уменьшить количество"
                          disabled={item.quantity <= 1}
                          className="grid size-11 place-items-center hover:bg-steel disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <Minus className="size-4" aria-hidden="true" />
                        </button>
                        <output aria-live="polite" className="w-10 text-center font-semibold">
                          {item.quantity}
                        </output>
                        <button
                          type="button"
                          onClick={() => changeQuantity(key, item.quantity + 1)}
                          aria-label="Увеличить количество"
                          disabled={item.quantity >= MAX_QUANTITY}
                          className="grid size-11 place-items-center hover:bg-steel disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                      <p className="font-display text-xl font-bold">{formatPrice(product.price * item.quantity, product.currency)}</p>
                      <button
                        type="button"
                        onClick={() => remove(key)}
                        aria-label={`Удалить из корзины: ${product.title}`}
                        className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm text-silver hover:text-red-hot"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                        Удалить
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={clear}
              className="mt-3 inline-flex min-h-11 items-center gap-2 px-2 text-sm text-silver hover:text-white"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Очистить корзину
            </button>
          </div>

          <aside aria-label="Итог заказа">
            <OrderSummary />
            <Link to="/checkout" className={`${btnPrimary} mt-4 w-full`}>
              Перейти к оформлению
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
