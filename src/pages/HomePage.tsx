import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '../components/common/Reveal'
import { SectionHeading } from '../components/common/SectionHeading'
import { Accordion } from '../components/common/Accordion'
import { AiPromo } from '../components/home/AiPromo'
import { BannerSlider } from '../components/home/BannerSlider'
import { Benefits } from '../components/home/Benefits'
import { CategoryTiles } from '../components/home/CategoryTiles'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalog } from '../context/CatalogContext'
import { faq } from '../data/faq'
import { sortProducts } from '../utils/catalog'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function HomePage() {
  useDocumentTitle()
  const { products } = useCatalog()

  const popular = useMemo(() => sortProducts(products, 'popular').slice(0, 8), [products])
  const offers = useMemo(
    () => sortProducts(products.filter((p) => p.badge === 'sale' && p.available), 'price-asc').slice(0, 4),
    [products],
  )
  const fresh = useMemo(() => sortProducts(products, 'new').slice(0, 4), [products])

  return (
    <>
      <h1 className="sr-only">BezB — Digital. Without Limits. Цифровые товары, игровые подписки и AI-сервисы</h1>
      <BannerSlider />

      <div className="container-x space-y-14 pt-10 sm:space-y-20 sm:pt-14">
        <Reveal>
          <SectionHeading title="Категории" eyebrow="Выбери платформу" linkTo="/catalog" linkLabel="Весь каталог" />
          <CategoryTiles />
        </Reveal>

        <Reveal>
          <SectionHeading title="Популярное" eyebrow="Чаще выбирают" linkTo="/catalog" />
          <ProductGrid products={popular} />
        </Reveal>

        {offers.length > 0 && (
          <Reveal>
            <SectionHeading title="Горячие предложения" eyebrow="Акции" linkTo="/catalog?sort=price-asc" />
            <ProductGrid products={offers} />
          </Reveal>
        )}

        <Reveal>
          <AiPromo />
        </Reveal>

        <Reveal>
          <SectionHeading title="Новинки" eyebrow="Свежие поступления" linkTo="/catalog?sort=new" />
          <ProductGrid products={fresh} />
        </Reveal>

        <Reveal>
          <SectionHeading title="Почему BezB" />
          <Benefits />
        </Reveal>

        <Reveal>
          <SectionHeading title="Частые вопросы" linkTo="/faq" linkLabel="Все вопросы" />
          <Accordion items={faq.slice(0, 4)} />
          <p className="mt-4 text-sm text-silver">
            Не нашли ответ? Загляните в{' '}
            <Link to="/delivery" className="text-white underline underline-offset-4 hover:text-red-hot">
              раздел о получении товаров
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </>
  )
}
