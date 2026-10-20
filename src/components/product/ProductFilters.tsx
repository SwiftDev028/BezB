import { useId, useState } from 'react'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import type { CatalogFilters, Category, CategoryId, ProductType } from '../../types'
import { categories, typeLabels } from '../../data/categories'
import { sortLabels } from '../../utils/catalog'
import type { CatalogView } from '../../hooks/useCatalogFilters'
import { inputClass } from '../common/ui'

interface ProductFiltersProps {
  filters: CatalogFilters
  view: CatalogView
  platforms: string[]
  /** Если задана — выбор категории скрыт (страница категории) */
  fixedCategory?: Category
  showSearch?: boolean
  resultCount: number
  onChange: (patch: Partial<CatalogFilters>) => void
  onViewChange: (view: CatalogView) => void
  onReset: () => void
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">
        {label}
      </label>
      {children}
    </div>
  )
}

function parsePriceInput(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function ProductFilters({
  filters,
  view,
  platforms,
  fixedCategory,
  showSearch = false,
  resultCount,
  onChange,
  onViewChange,
  onReset,
}: ProductFiltersProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const id = (name: string) => `${uid}-${name}`

  const typeOptions: ProductType[] = fixedCategory
    ? fixedCategory.types
    : ['gift-card', 'game', 'subscription', 'topup']

  const activeCount = [
    filters.query.trim() !== '' && showSearch,
    !fixedCategory && filters.category !== 'all',
    filters.type !== 'all',
    filters.platform !== 'all',
    filters.minPrice !== null,
    filters.maxPrice !== null,
    filters.onlyAvailable,
  ].filter(Boolean).length

  return (
    <section aria-label="Фильтры и сортировка" className="mb-6 border border-line bg-coal">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id('panel')}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap border border-line bg-graphite px-4 font-semibold hover:border-silver lg:hidden"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          Фильтры{activeCount > 0 && ` (${activeCount})`}
        </button>
        <p className="text-sm text-silver" aria-live="polite">
          Найдено: <strong className="text-white">{resultCount}</strong>
        </p>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Вид списка">
          <button
            type="button"
            aria-pressed={view === 'grid'}
            aria-label="Сетка"
            onClick={() => onViewChange('grid')}
            className={`grid size-11 place-items-center border ${view === 'grid' ? 'border-red bg-red text-white' : 'border-line bg-graphite text-silver hover:text-white'}`}
          >
            <LayoutGrid className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-pressed={view === 'list'}
            aria-label="Список"
            onClick={() => onViewChange('list')}
            className={`grid size-11 place-items-center border ${view === 'list' ? 'border-red bg-red text-white' : 'border-line bg-graphite text-silver hover:text-white'}`}
          >
            <List className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        id={id('panel')}
        className={`${open ? 'grid' : 'hidden'} grid-cols-1 gap-4 border-t border-line p-3 sm:grid-cols-2 sm:p-4 lg:grid lg:grid-cols-4`}
      >
        {showSearch && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Field label="Поиск" htmlFor={id('q')}>
              <input
                id={id('q')}
                type="search"
                value={filters.query}
                onChange={(e) => onChange({ query: e.target.value })}
                placeholder="Название, платформа, описание"
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {!fixedCategory && (
          <Field label="Категория" htmlFor={id('cat')}>
            <select
              id={id('cat')}
              value={filters.category}
              onChange={(e) => onChange({ category: e.target.value as CategoryId | 'all' })}
              className={inputClass}
            >
              <option value="all">Все категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Тип товара" htmlFor={id('type')}>
          <select
            id={id('type')}
            value={filters.type}
            onChange={(e) => onChange({ type: e.target.value as ProductType | 'all' })}
            className={inputClass}
          >
            <option value="all">Любой тип</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Платформа" htmlFor={id('platform')}>
          <select
            id={id('platform')}
            value={filters.platform}
            onChange={(e) => onChange({ platform: e.target.value })}
            className={inputClass}
          >
            <option value="all">Любая платформа</option>
            {platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Сортировка" htmlFor={id('sort')}>
          <select
            id={id('sort')}
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as CatalogFilters['sort'] })}
            className={inputClass}
          >
            {Object.entries(sortLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Цена от, ₽" htmlFor={id('min')}>
          <input
            id={id('min')}
            type="number"
            inputMode="numeric"
            min={0}
            value={filters.minPrice ?? ''}
            onChange={(e) => onChange({ minPrice: parsePriceInput(e.target.value) })}
            placeholder="0"
            className={inputClass}
          />
        </Field>

        <Field label="Цена до, ₽" htmlFor={id('max')}>
          <input
            id={id('max')}
            type="number"
            inputMode="numeric"
            min={0}
            value={filters.maxPrice ?? ''}
            onChange={(e) => onChange({ maxPrice: parsePriceInput(e.target.value) })}
            placeholder="Без ограничения"
            className={inputClass}
          />
        </Field>

        <div className="flex items-end">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={filters.onlyAvailable}
              onChange={(e) => onChange({ onlyAvailable: e.target.checked })}
              className="size-5 accent-red"
            />
            <span>Только в наличии</span>
          </label>
        </div>

        <div className="flex items-end lg:col-start-4">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-line px-4 text-silver hover:border-silver hover:text-white"
          >
            <X className="size-4" aria-hidden="true" />
            Сбросить фильтры
          </button>
        </div>
      </div>
    </section>
  )
}
