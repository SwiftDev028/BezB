import { useEffect, useId, useRef, useState } from 'react'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import type { CatalogFilters } from '../../types'
import { sortLabels } from '../../utils/catalog'
import type { ActiveFilter, Facet, FacetId } from '../../utils/facets'
import type { CatalogView } from '../../hooks/useCatalogFilters'
import { formatPrice } from '../../utils/format'
import { btnPrimary, inputClass } from '../common/ui'

interface ProductFiltersProps {
  filters: CatalogFilters
  view: CatalogView
  /** Характеристики, у которых в текущем ассортименте есть из чего выбирать */
  facets: Facet[]
  priceBounds: { min: number; max: number } | null
  active: ActiveFilter[]
  showSearch?: boolean
  /** null — данные ещё грузятся или произошла ошибка: счётчик не показываем */
  resultCount: number | null
  onChange: (patch: Partial<CatalogFilters>) => void
  onViewChange: (view: CatalogView) => void
  onReset: () => void
}

const facetPatch = (id: FacetId, value: string): Partial<CatalogFilters> => ({ [id]: value }) as Partial<CatalogFilters>

const MAX_CHIPS = 8

function parsePriceInput(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 border px-3.5 text-sm font-semibold transition-colors lg:min-h-10 ${
        selected ? 'border-red bg-red text-white' : 'border-line bg-graphite text-white hover:border-silver'
      }`}
    >
      {children}
    </button>
  )
}

function FacetGroup({ facet, onChange }: { facet: Facet; onChange: (patch: Partial<CatalogFilters>) => void }) {
  const uid = useId()
  const total = facet.options.reduce((sum, o) => sum + o.count, 0)
  return (
    <fieldset className="min-w-0">
      <legend id={uid} className="mb-2 text-xs font-semibold uppercase tracking-wider text-silver">
        {facet.label}
      </legend>
      {facet.options.length > MAX_CHIPS ? (
        <select
          aria-labelledby={uid}
          value={facet.selected}
          onChange={(e) => onChange(facetPatch(facet.id, e.target.value))}
          className={inputClass}
        >
          <option value="all">Все ({total})</option>
          {facet.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label} ({o.count})
            </option>
          ))}
        </select>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Chip selected={facet.selected === 'all'} onClick={() => onChange(facetPatch(facet.id, 'all'))}>
            Все
          </Chip>
          {facet.options.map((o) => (
            <Chip key={o.value} selected={facet.selected === o.value} onClick={() => onChange(facetPatch(facet.id, o.value))}>
              {o.label}
              <span className={`text-xs font-normal ${facet.selected === o.value ? 'text-white/80' : 'text-silver'}`}>{o.count}</span>
            </Chip>
          ))}
        </div>
      )}
    </fieldset>
  )
}

export function ProductFilters({
  filters,
  view,
  facets,
  priceBounds,
  active,
  showSearch = false,
  resultCount,
  onChange,
  onViewChange,
  onReset,
}: ProductFiltersProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const id = (name: string) => `${uid}-${name}`
  const sheetRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  const showPrice = priceBounds !== null && (priceBounds.min < priceBounds.max || filters.minPrice !== null || filters.maxPrice !== null)
  const hasPanel = facets.length > 0 || showPrice
  const filterCount = active.filter((a) => a.key !== 'q').length

  // Мобильная панель — диалог: Escape закрывает, фон не прокручивается, фокус возвращается на кнопку.
  useEffect(() => {
    if (!open) return
    const media = window.matchMedia('(min-width: 1024px)')
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    media.addEventListener('change', close)
    sheetRef.current?.focus()
    const toggle = toggleRef.current
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
      media.removeEventListener('change', close)
      toggle?.focus()
    }
  }, [open])

  return (
    <section aria-label="Фильтры и сортировка" className="mb-6 border border-line bg-coal">
      {showSearch && (
        <div className="border-b border-line p-3 sm:p-4">
          <label htmlFor={id('q')} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">
            Поиск
          </label>
          <input
            id={id('q')}
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Название, платформа, описание"
            className={inputClass}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4">
        {hasPanel && (
          <button
            ref={toggleRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={id('panel')}
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap border border-line bg-graphite px-4 font-semibold hover:border-silver lg:hidden"
          >
            <SlidersHorizontal className="size-5" aria-hidden="true" />
            Фильтры{filterCount > 0 && ` (${filterCount})`}
          </button>
        )}
        <p className="text-sm text-silver" aria-live="polite">
          Найдено: <strong className="text-white">{resultCount ?? '—'}</strong>
        </p>
        <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">
          <label htmlFor={id('sort')} className="sr-only">
            Сортировка
          </label>
          <select
            id={id('sort')}
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as CatalogFilters['sort'] })}
            className={`${inputClass} min-w-0 sm:w-56`}
          >
            {Object.entries(sortLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Вид списка">
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
      </div>

      {hasPanel && (
        <>
          {open && <div className="fixed inset-0 z-40 bg-black/70 lg:hidden" aria-hidden="true" onClick={() => setOpen(false)} />}
          <div
            id={id('panel')}
            ref={sheetRef}
            tabIndex={-1}
            role={open ? 'dialog' : undefined}
            aria-modal={open ? true : undefined}
            aria-label="Фильтры"
            className={`${
              open
                ? 'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col border-t border-line bg-coal'
                : 'hidden'
            } outline-none lg:static lg:z-auto lg:flex lg:max-h-none lg:border-t lg:border-line`}
          >
            <div className="flex items-center justify-between border-b border-line p-3 lg:hidden">
              <h2 className="font-display text-xl uppercase">Фильтры</h2>
              <button
                type="button"
                aria-label="Закрыть фильтры"
                onClick={() => setOpen(false)}
                className="grid size-11 place-items-center text-silver hover:text-white"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:grid lg:flex-none lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] lg:gap-x-6 lg:gap-y-5 lg:space-y-0 lg:overflow-visible">
              {facets.map((facet) => (
                <FacetGroup key={facet.id} facet={facet} onChange={onChange} />
              ))}
              {showPrice && priceBounds && (
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-silver">Цена, ₽</legend>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={id('min')}>
                      Цена от
                    </label>
                    <input
                      id={id('min')}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={filters.minPrice ?? ''}
                      onChange={(e) => onChange({ minPrice: parsePriceInput(e.target.value) })}
                      placeholder={`от ${formatPrice(priceBounds.min).replace(/\s?₽/, '')}`}
                      className={inputClass}
                    />
                    <span aria-hidden="true" className="text-silver">
                      —
                    </span>
                    <label className="sr-only" htmlFor={id('max')}>
                      Цена до
                    </label>
                    <input
                      id={id('max')}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={filters.maxPrice ?? ''}
                      onChange={(e) => onChange({ maxPrice: parsePriceInput(e.target.value) })}
                      placeholder={`до ${formatPrice(priceBounds.max).replace(/\s?₽/, '')}`}
                      className={inputClass}
                    />
                  </div>
                </fieldset>
              )}
            </div>

            <div className="flex gap-3 border-t border-line p-3 lg:hidden">
              <button
                type="button"
                onClick={onReset}
                disabled={active.length === 0}
                className="min-h-11 flex-1 border border-line px-4 text-silver hover:border-silver hover:text-white disabled:opacity-50"
              >
                Сбросить
              </button>
              <button type="button" onClick={() => setOpen(false)} className={`${btnPrimary} flex-[2]`}>
                Показать{resultCount !== null ? ` (${resultCount})` : ''}
              </button>
            </div>
          </div>
        </>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line p-3 sm:px-4" aria-label="Выбранные фильтры" role="group">
          {active.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => onChange(a.patch)}
              aria-label={`Убрать фильтр: ${a.label}`}
              className="inline-flex min-h-11 max-w-full items-center gap-1.5 sm:min-h-9 border border-line bg-graphite px-3 text-sm hover:border-silver"
            >
              <span className="truncate">{a.label}</span>
              <X className="size-3.5 shrink-0 text-silver" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={onReset} className="min-h-11 px-2 text-sm text-silver underline sm:min-h-9 underline-offset-4 hover:text-white">
            Сбросить всё
          </button>
        </div>
      )}
    </section>
  )
}
