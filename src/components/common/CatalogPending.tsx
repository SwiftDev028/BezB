import { useCatalog } from '../../context/CatalogContext'
import { btnSecondary } from './ui'

/** Показывается вместо «пусто», пока каталог грузится или не загрузился: состав нельзя определить. */
export function CatalogPending() {
  const { error, refresh } = useCatalog()
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 border border-red p-4 text-silver">
        <p>Не удалось загрузить каталог: {error}</p>
        <button type="button" onClick={() => void refresh()} className={btnSecondary}>
          Повторить
        </button>
      </div>
    )
  }
  return (
    <p role="status" className="text-silver">
      Загружаем товары…
    </p>
  )
}
