import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, Info } from 'lucide-react'
import { CatalogPending } from '../components/common/CatalogPending'
import { SectionHeading } from '../components/common/SectionHeading'
import { btnSecondary } from '../components/common/ui'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalog } from '../context/CatalogContext'
import { categoryById } from '../data/categories'
import { getGame } from '../data/games'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { assetUrl } from '../utils/assetUrl'

export default function GamePage() {
  const { slug } = useParams()
  const game = getGame(slug)
  const { products, loading, error } = useCatalog()
  useDocumentTitle(game?.title)

  // Только реальные товары из каталога. Ничего не подставляем и не придумываем.
  const gameProducts = useMemo(
    () => (game ? products.filter((p) => p.type === 'game' && game.catalogTitlePattern.test(p.title)) : []),
    [products, game],
  )

  if (!game) return <Navigate to="/404" replace />

  return (
    <>
      <section aria-labelledby="game-title" className="relative overflow-hidden border-b border-line bg-ink">
        <img
          src={assetUrl(game.cover)}
          alt=""
          aria-hidden="true"
          width={1260}
          height={433}
          decoding="async"
          className="absolute inset-x-0 top-0 h-56 w-full object-cover object-[48%_center] [-webkit-mask-image:linear-gradient(to_bottom,#000_55%,transparent)] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[62%] md:[-webkit-mask-image:linear-gradient(to_right,transparent,#000_45%)] md:[mask-image:linear-gradient(to_right,transparent,#000_45%)]"
        />
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: game.accent }} aria-hidden="true" />
        <div className="container-x relative py-12 max-md:pt-52 sm:py-20">
          <p className="mb-2 font-display text-sm uppercase tracking-[0.25em]" style={{ color: game.accent }}>
            {game.publisher}
          </p>
          <h1 id="game-title" className="text-5xl sm:text-6xl lg:text-7xl">
            {game.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-silver sm:text-lg">{game.description}</p>
          {game.releaseNote && (
            <p className="mt-4 flex items-center gap-2 text-sm text-silver">
              <CalendarDays className="size-4 shrink-0" style={{ color: game.accent }} aria-hidden="true" />
              {game.releaseNote}
            </p>
          )}
        </div>
      </section>

      <div className="container-x space-y-12 py-10 sm:space-y-16 sm:py-14">
        <section aria-label="Платформы">
          <SectionHeading title="Платформы" eyebrow="Выберите категорию" />
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {game.platforms.map((platform) => {
              const category = categoryById[platform.category]
              const count = gameProducts.filter((p) => p.category === platform.category).length
              return (
                <li key={platform.category}>
                  <Link
                    to={`/category/${platform.category}?type=game`}
                    className="group texture-hatch relative flex min-h-32 flex-col justify-between gap-4 overflow-hidden border border-line bg-coal p-5 transition-colors hover:border-red"
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-1.5"
                      style={{ background: category.accent }}
                    />
                    <div>
                      <p className="font-display text-sm uppercase tracking-[0.2em]" style={{ color: category.accent }}>
                        {category.title}
                      </p>
                      <h3 className="mt-1 text-2xl sm:text-3xl">{platform.label}</h3>
                    </div>
                    <p className="flex items-center justify-between gap-3 text-sm text-silver">
                      <span>
                        {loading || error
                          ? 'Проверяем каталог…'
                          : count > 0
                            ? `В каталоге: ${count}`
                            : 'Товаров GTA VI пока нет'}
                      </span>
                      <span className="inline-flex items-center gap-1 font-semibold text-white group-hover:text-red-hot">
                        Игры {category.title}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </span>
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 flex gap-2 text-sm text-silver">
            <Info className="mt-0.5 size-4 shrink-0 text-red" aria-hidden="true" />
            {game.platformNote}
          </p>
        </section>

        {(loading || error) && <CatalogPending />}

        {gameProducts.length > 0 && (
          <section aria-label="Товары в каталоге">
            <SectionHeading title={`${game.title} в каталоге`} eyebrow="Доступные варианты" />
            <ProductGrid products={gameProducts} />
          </section>
        )}

        <div>
          <Link to="/catalog?type=game" className={btnSecondary}>
            Все игры в каталоге
          </Link>
        </div>
      </div>
    </>
  )
}
