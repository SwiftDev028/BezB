import { Link } from 'react-router-dom'
import { btnPrimary, btnSecondary } from '../components/common/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Страница не найдена')
  return (
    <div className="container-x py-16 text-center sm:py-24">
      <p className="font-display text-[8rem] font-bold leading-none text-red sm:text-[12rem]" aria-hidden="true">
        404
      </p>
      <h1 className="text-3xl sm:text-5xl">Страница не найдена</h1>
      <p className="mx-auto mt-3 max-w-md text-silver">Такого адреса нет — возможно, он изменился или товар убрали из каталога.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className={btnPrimary}>На главную</Link>
        <Link to="/catalog" className={btnSecondary}>В каталог</Link>
      </div>
    </div>
  )
}
