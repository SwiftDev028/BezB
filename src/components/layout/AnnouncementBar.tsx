import { Info } from 'lucide-react'

export function AnnouncementBar() {
  return (
    <div className="bg-red text-white">
      <p className="container-x flex items-center justify-center gap-2 py-2 text-center text-xs font-semibold sm:text-sm">
        <Info className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
        Демонстрационный режим: цены тестовые, оплата не подключена, товары не выдаются.
      </p>
    </div>
  )
}
