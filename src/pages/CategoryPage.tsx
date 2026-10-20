import { Navigate, useParams } from 'react-router-dom'
import { categories, categoryById } from '../data/categories'
import { CatalogBrowser } from '../components/product/CatalogBrowser'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { CategoryId } from '../types'

export default function CategoryPage() {
  const { id } = useParams()
  const category = categories.find((c) => c.id === id) ? categoryById[id as CategoryId] : undefined
  useDocumentTitle(category?.title)

  if (!category) return <Navigate to="/404" replace />

  return (
    <>
      <section
        aria-labelledby="category-title"
        className="texture-hatch relative overflow-hidden border-b border-line bg-coal"
      >
        <div
          aria-hidden="true"
          className="absolute -right-10 top-0 h-full w-1/3 -skew-x-[18deg] opacity-25"
          style={{ background: `linear-gradient(180deg, ${category.accent}, transparent)` }}
        />
        <div className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: category.accent }} aria-hidden="true" />
        <div className="container-x relative py-10 sm:py-14">
          <p className="mb-2 font-display text-sm uppercase tracking-[0.25em]" style={{ color: category.accent }}>
            {category.short}
          </p>
          <h1 id="category-title" className="text-5xl sm:text-6xl lg:text-7xl">
            {category.title}
          </h1>
          <p className="mt-4 max-w-2xl text-silver">{category.description}</p>
        </div>
      </section>
      <div className="container-x py-8 sm:py-10">
        <CatalogBrowser category={category} emptyTitle="В этой категории ничего не найдено" />
      </div>
    </>
  )
}
