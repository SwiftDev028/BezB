import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRight, Globe, PackageCheck, TriangleAlert } from 'lucide-react'
import { categoryById, typeLabels } from '../data/categories'
import { useCatalog } from '../context/CatalogContext'
import { relatedProducts } from '../utils/catalog'
import { ProductArt } from '../components/common/ProductArt'
import { SectionHeading } from '../components/common/SectionHeading'
import { AddToCartButton } from '../components/product/AddToCartButton'
import { Badge } from '../components/product/Badge'
import { FavoriteButton } from '../components/product/FavoriteButton'
import { Price } from '../components/product/Price'
import { ProductGrid } from '../components/product/ProductGrid'
import { ProductDescription } from '../components/product/ProductDescription'
import { btnSecondary, inputClass } from '../components/common/ui'
import { subscriptionTerm } from '../utils/catalog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import NotFoundPage from './NotFoundPage'

export default function ProductPage() {
  const { slug = '' } = useParams()
  const { products, getProduct, loading, error, refresh } = useCatalog()
  const initialProduct = getProduct(slug)
  const [variantSlug, setVariantSlug] = useState(slug)
  useEffect(() => setVariantSlug(slug), [slug])
  const product = getProduct(variantSlug) ?? initialProduct
  useDocumentTitle(product?.title)

  if (loading && !product) return <div role="status" className="container-x py-12 text-silver">Загружаем товар…</div>
  if (error && !product) {
    return (
      <div className="container-x py-12">
        <div role="alert" className="flex flex-col items-start gap-3 border border-red p-4 text-silver">
          <p>Не удалось загрузить товар: {error}</p>
          <button type="button" onClick={() => void refresh()} className={btnSecondary}>
            Повторить
          </button>
        </div>
      </div>
    )
  }
  if (!product) return <NotFoundPage />

  const category = categoryById[product.category]
  const variants = products.filter((p) => p.groupId && p.groupId === product.groupId)
  const related = relatedProducts(products, product).filter((p) => p.groupId !== product.groupId)

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
          <ProductArt category={product.category} type={product.type} label={product.platform} imageUrl={product.imageUrl} className="border border-line" />
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
          <div className="mt-5">
            <ProductDescription description={product.description} />
          </div>

          {variants.length > 1 && (
            <div className="mt-6 max-w-xs">
              <label htmlFor="variant" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">
                Вариант товара
              </label>
              <select
                id="variant"
                value={product.slug}
                onChange={(e) => setVariantSlug(e.target.value)}
                className={inputClass}
              >
                {variants.map((variant) => (
                  <option key={variant.slug} value={variant.slug}>
                    {[variant.country, subscriptionTerm(variant), variant.denomination !== null && variant.denomination !== undefined ? `${variant.denomination} ${variant.denominationCurrency ?? ''}` : ''].filter(Boolean).join(' · ')} — {variant.price} RUB
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
              region={product.country}
              className="flex-1 sm:flex-none sm:px-10"
            />
            <FavoriteButton productId={product.id} title={product.title} className="border border-line" />
          </div>
          <p className="mt-3 text-sm text-silver">
            Оплата подтверждается администратором вручную. Цифровой товар появится в личном кабинете после оплаты и выдачи.
          </p>

          <dl className="mt-8 divide-y divide-line border-y border-line">
            <div className="flex gap-3 py-4">
              <Globe className="mt-0.5 size-5 shrink-0 text-red" aria-hidden="true" />
              <div>
                <dt className="font-semibold text-white">Платформа и регион</dt>
                <dd className="mt-1 text-sm text-silver">
                  {product.platform}
                  {subscriptionTerm(product) ? ` · Срок: ${subscriptionTerm(product)}` : ''}
                  {product.country ? ` · Регион: ${product.country}` : ''}{product.denomination !== null && product.denomination !== undefined ? ` · Номинал: ${product.denomination} ${product.denominationCurrency ?? ''}` : ''}
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
