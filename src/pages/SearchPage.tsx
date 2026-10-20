import { useSearchParams } from 'react-router-dom'
import { CatalogBrowser } from '../components/product/CatalogBrowser'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q')?.trim() ?? ''
  useDocumentTitle(q ? `Поиск: ${q}` : 'Поиск')

  return (
    <div className="container-x py-8 sm:py-12">
      <h1 className="mb-2 text-4xl sm:text-5xl">{q ? `Поиск: «${q}»` : 'Поиск'}</h1>
      <p className="mb-6 text-silver">Поиск идёт по названию, описанию, платформе и тегам.</p>
      <CatalogBrowser showSearch emptyTitle="По вашему запросу ничего не найдено" />
    </div>
  )
}
