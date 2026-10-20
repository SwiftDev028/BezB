import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Globe, PackageCheck, TriangleAlert } from 'lucide-react'
import { categoryById, typeLabels } from '../data/categories'
import { getProduct, products } from '../data/products'
import { relatedProducts } from '../utils/catalog'
import { ProductArt } from '../components/common/ProductArt'
import { SectionHeading } from '../components/common/SectionHeading'
import { AddToCartButton } from '../components/product/AddToCartButton'
import { Badge } from '../components/product/Badge'
import { FavoriteButton } from '../components/product/FavoriteButton'
import { Price } from '../components/product/Price'
import { ProductGrid } from '../components/product/ProductGrid'
import { inputClass } from '../components/common/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import NotFoundPage from './NotFoundPage'

export default function ProductPage() {
  const { slug = '' } = useParams()
  const product = getProduct(slug)
  const [chosenRegion, setChosenRegion] = useState<string | null>(null)
  useDocumentTitle(product?.title)

  if (!product) return <NotFoundPage />

  const category = categoryById[product.category]
  const region = product.regions ? (chosenRegion && product.regions.includes(chosenRegion) ? chosenRegion : product.regions[0]) : undefined
  const related = relatedProducts(products, product)

  return (
    <div className="container-x py-6 sm:py-10">
      <nav aria-label="Навигационная цепочка" className="mb-5 text-sm text-silver">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/" className="hover:text-white">Главная</Link>
          </li>
          <ChevronRight className="size-4" aria-hidden="true" />
          <li>
            <Link to={`/category/${category.id}`} className="hover:text-white">{category.title}</Link>
          </li>
          <ChevronRight className="size-4" aria-hidden="true" />
          <li aria-current="page" className="text-white">{product.title}</li>
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="relative">
          <ProductArt category={product.category} type={product.type} label={product.platform} className="border border-line" />
          {product.badge && (
            <div className="absolute left-3 top-3">
              <Badge badge={product.badge} />
            </div>
          )}
        </div>

        <div>
          <p className="text-sm uppercase tracking-wider text-silver">
            {product.platform} · {typeLabels[product.type]}
          </p>
          <h1 className="mt-2 text-3xl normal-case sm:text-5xl">{product.title}</h1>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Price product={product} large />
            <span
              className={`px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                product.available ? 'bg-steel text-white' : 'bg-red-dark text-white'
              }`}
            >
              {product.available ? 'В наличии' : 'Нет в наличии'}
            </span>
          </div>
          <p className="mt-1 text-xs text-silver">Демонстрационная цена.</p>

          <p className="mt-5 text-silver">{product.description}</p>

          {product.regions && (
            <div className="mt-6 max-w-xs">
              <label htmlFor="region" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">
                Регион карты
              </label>
              <select
                id="region"
                value={region}
                onChange={(e) => setChosenRegion(e.target.value)}
                className={inputClass}
              >
                {product.regions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <AddToCartButton
              productId={product.id}
              title={product.title}
              available={product.available}
              region={region}
              className="flex-1 sm:flex-none sm:px-10"
            />
            <FavoriteButton productId={product.id} title={product.title} className="border border-line" />
          </div>
          <p className="mt-3 text-sm text-silver">
            Оплата пока не подключена: оформление создаёт только демонстрационный заказ.
          </p>

          <dl className="mt-8 divide-y divide-line border-y border-line">
            <div className="flex gap-3 py-4">
              <Globe className="mt-0.5 size-5 shrink-0 text-red" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-white">Платформа и регион</dt>
                <dd className="mt-1 text-sm text-silver">
                  {product.platform}
                  {product.regions ? `. Доступные регионы: ${product.regions.join(', ')}.` : '. Регион уточняйте перед покупкой.'}
                </dd>
              </div>
            </div>
            <div className="flex gap-3 py-4">
              <PackageCheck className="mt-0.5 size-5 shrink-0 text-red" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-white">Получение товара</dt>
                <dd className="mt-1 text-sm text-silver">
                  {product.delivery} <Link to="/delivery" className="underline underline-offset-4 hover:text-white">Подробнее</Link>
                </dd>
              </div>
            </div>
            <div className="flex gap-3 py-4">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-white">Ограничения и совместимость</dt>
                <dd className="mt-1">
                  <ul className="list-disc space-y-1 pl-5 text-sm text-silver">
                    {product.restrictions.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </div>
          </dl>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related" className="mt-14">
          <SectionHeading title="Похожие товары" linkTo={`/category/${category.id}`} linkLabel={`Все ${category.title}`} />
          <h2 id="related" className="sr-only">Похожие товары</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </div>
  )
}
