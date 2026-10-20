import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { OrdersProvider } from '../../context/OrdersContext'

/** Оболочка админки: демо-предупреждение, запрет индексации, контекст заказов. */
export default function AdminLayout() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      meta.remove()
    }
  }, [])

  return (
    <OrdersProvider>
      <div className="container-x py-8 sm:py-12">
        <div role="note" className="mb-8 flex gap-3 border border-red bg-red/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-hot" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold text-white">Демонстрационная админ-панель</p>
            <p className="text-silver">
              Авторизации нет: сайт статический, и любой посетитель может открыть эту страницу. Заказы хранятся только
              в вашем браузере (localStorage) и никуда не передаются. Не вносите реальные персональные данные, коды и
              пароли. Настоящая админка потребует backend с входом и проверкой прав (см. docs/BACKEND.md в репозитории).
            </p>
          </div>
        </div>
        <Outlet />
      </div>
    </OrdersProvider>
  )
}
