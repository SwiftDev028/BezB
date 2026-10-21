import { CatalogBrowser } from '../components/product/CatalogBrowser'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function CatalogPage() {
  useDocumentTitle('Каталог')
  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="mb-2 text-4xl sm:text-5xl">Каталог</h1>
      <p className="mb-6 max-w-2xl text-silver">
        Публикуются только подтверждённые товары с актуальными ценами и наличием.
      </p>
      <CatalogBrowser showSearch />
    </div>
  )
}
