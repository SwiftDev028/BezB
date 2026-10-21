import { useId, useMemo, useState } from 'react'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import type { CatalogFilters, Category, CategoryId, Product, ProductType } from '../../types'
import { categories, typeLabels } from '../../data/categories'
import { sortLabels } from '../../utils/catalog'
import type { CatalogView } from '../../hooks/useCatalogFilters'
import { inputClass } from '../common/ui'

interface ProductFiltersProps {
  filters: CatalogFilters
  view: CatalogView
  products: Product[]
  fixedCategory?: Category
  showSearch?: boolean
  loading?: boolean
  hasError?: boolean
  resultCount: number
  onChange: (patch: Partial<CatalogFilters>) => void
  onViewChange: (view: CatalogView) => void
  onReset: () => void
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div><label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">{label}</label>{children}</div>
}

function parsePriceInput(value: string): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function ProductFilters({ filters, view, products, fixedCategory, showSearch = false, loading = false, hasError = false, resultCount, onChange, onViewChange, onReset }: ProductFiltersProps) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const id = (name: string) => `${uid}-${name}`

  const facets = useMemo(() => {
    const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ru'))
    const regions = unique(products.map((p) => p.country))
    const regionProducts = filters.region === 'all' ? products : products.filter((p) => p.country === filters.region)
    const denominations = [...new Map(regionProducts
      .filter((p) => p.denomination != null && Number.isFinite(p.denomination))
      .map((p) => [`${p.denomination}:${p.denominationCurrency ?? ''}`, { key: `${p.denomination}:${p.denominationCurrency ?? ''}`, label: `${p.denomination} ${p.denominationCurrency ?? ''}`.trim(), value: p.denomination! }])).values()]
      .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label, 'ru'))
    return {
      regions,
      denominations,
      platforms: unique(regionProducts.map((p) => p.platform)),
      types: unique(regionProducts.map((p) => p.type)) as ProductType[],
      hasPriceRange: new Set(regionProducts.map((p) => p.price)).size > 1,
      hasAvailabilityChoice: regionProducts.some((p) => p.available) && regionProducts.some((p) => !p.available),
    }
  }, [products, filters.region])

  const activeFilters = [
    ...(showSearch && filters.query.trim() ? [{ label: `Поиск: ${filters.query.trim()}`, patch: { query: '' } }] : []),
    ...(!fixedCategory && filters.category !== 'all' ? [{ label: `Категория: ${categories.find((c) => c.id === filters.category)?.title ?? filters.category}`, patch: { category: 'all' as const } }] : []),
    ...(filters.type !== 'all' ? [{ label: `Тип: ${typeLabels[filters.type]}`, patch: { type: 'all' as const } }] : []),
    ...(filters.platform !== 'all' ? [{ label: `Платформа: ${filters.platform}`, patch: { platform: 'all' as const } }] : []),
    ...(filters.region !== 'all' ? [{ label: `Регион: ${filters.region}`, patch: { region: 'all' as const, denomination: null } }] : []),
    ...(filters.denomination !== null ? [{ label: `Номинал: ${facets.denominations.find((d) => d.key === filters.denomination)?.label ?? filters.denomination}`, patch: { denomination: null } }] : []),
    ...(filters.minPrice !== null ? [{ label: `От ${filters.minPrice} ₽`, patch: { minPrice: null } }] : []),
    ...(filters.maxPrice !== null ? [{ label: `До ${filters.maxPrice} ₽`, patch: { maxPrice: null } }] : []),
    ...(filters.onlyAvailable ? [{ label: 'Только в наличии', patch: { onlyAvailable: false } }] : []),
  ]

  return (
    <section aria-label="Фильтры и сортировка" className="mb-6 border border-line bg-coal">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4">
        <button type="button" aria-expanded={open} aria-controls={id('panel')} onClick={() => setOpen((v) => !v)} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap border border-line bg-graphite px-4 font-semibold hover:border-silver lg:hidden">
          <SlidersHorizontal className="size-5" aria-hidden="true" />Фильтры{activeFilters.length > 0 && ` (${activeFilters.length})`}
        </button>
        <p className="text-sm text-silver" aria-live="polite">{loading ? 'Загружаем каталог…' : hasError ? 'Каталог временно недоступен' : <>Найдено: <strong className="text-white">{resultCount}</strong></>}</p>
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Вид списка">
          <button type="button" aria-pressed={view === 'grid'} aria-label="Сетка" onClick={() => onViewChange('grid')} className={`grid size-11 place-items-center border ${view === 'grid' ? 'border-red bg-red text-white' : 'border-line bg-graphite text-silver hover:text-white'}`}><LayoutGrid className="size-5" aria-hidden="true" /></button>
          <button type="button" aria-pressed={view === 'list'} aria-label="Список" onClick={() => onViewChange('list')} className={`grid size-11 place-items-center border ${view === 'list' ? 'border-red bg-red text-white' : 'border-line bg-graphite text-silver hover:text-white'}`}><List className="size-5" aria-hidden="true" /></button>
        </div>
      </div>

      <div id={id('panel')} className={`${open ? 'grid' : 'hidden'} grid-cols-1 gap-4 border-t border-line p-3 sm:grid-cols-2 sm:p-4 lg:grid lg:grid-cols-4`}>
        {showSearch && <div className="sm:col-span-2 lg:col-span-4"><Field label="Поиск" htmlFor={id('q')}><input id={id('q')} type="search" value={filters.query} onChange={(e) => onChange({ query: e.target.value })} placeholder="Название, платформа, описание" className={inputClass} /></Field></div>}
        {!fixedCategory && <Field label="Категория" htmlFor={id('cat')}><select id={id('cat')} value={filters.category} onChange={(e) => onChange({ category: e.target.value as CategoryId | 'all' })} className={inputClass}><option value="all">Все категории</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>}
        {facets.types.length > 1 && <Field label="Тип товара" htmlFor={id('type')}><select id={id('type')} value={filters.type} onChange={(e) => onChange({ type: e.target.value as ProductType | 'all' })} className={inputClass}><option value="all">Любой тип</option>{facets.types.map((t) => <option key={t} value={t}>{typeLabels[t]}</option>)}</select></Field>}
        {facets.platforms.length > 1 && <Field label="Платформа" htmlFor={id('platform')}><select id={id('platform')} value={filters.platform} onChange={(e) => onChange({ platform: e.target.value })} className={inputClass}><option value="all">Любая платформа</option>{facets.platforms.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>}
        {facets.regions.length > 1 && <Field label="Регион" htmlFor={id('region')}><select id={id('region')} value={filters.region} onChange={(e) => onChange({ region: e.target.value, denomination: null })} className={inputClass}><option value="all">Все регионы</option>{facets.regions.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>}
        {facets.denominations.length > 1 && <Field label="Номинал" htmlFor={id('den')}><select id={id('den')} value={filters.denomination ?? ''} onChange={(e) => onChange({ denomination: e.target.value || null })} className={inputClass}><option value="">Все номиналы</option>{facets.denominations.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></Field>}
        <Field label="Сортировка" htmlFor={id('sort')}><select id={id('sort')} value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as CatalogFilters['sort'] })} className={inputClass}>{Object.entries(sortLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        {facets.hasPriceRange && <><Field label="Цена от, ₽" htmlFor={id('min')}><input id={id('min')} type="number" inputMode="numeric" min={0} value={filters.minPrice ?? ''} onChange={(e) => onChange({ minPrice: parsePriceInput(e.target.value) })} placeholder="0" className={inputClass} /></Field><Field label="Цена до, ₽" htmlFor={id('max')}><input id={id('max')} type="number" inputMode="numeric" min={0} value={filters.maxPrice ?? ''} onChange={(e) => onChange({ maxPrice: parsePriceInput(e.target.value) })} placeholder="Без ограничения" className={inputClass} /></Field></>}
        {facets.hasAvailabilityChoice && <div className="flex items-end"><label className="flex min-h-11 cursor-pointer items-center gap-3"><input type="checkbox" checked={filters.onlyAvailable} onChange={(e) => onChange({ onlyAvailable: e.target.checked })} className="size-5 accent-red" /><span>Только в наличии</span></label></div>}
        <div className="flex items-end lg:col-start-4"><button type="button" onClick={onReset} className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-line px-4 text-silver hover:border-silver hover:text-white"><X className="size-4" aria-hidden="true" />Сбросить фильтры</button></div>
      </div>
      {activeFilters.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-3 sm:px-4"><span className="mr-1 text-xs uppercase tracking-wider text-silver">Активно:</span>{activeFilters.map((item) => <button type="button" key={item.label} onClick={() => onChange(item.patch)} className="inline-flex min-h-9 items-center gap-1 border border-line bg-graphite px-3 text-sm hover:border-silver">{item.label}<X size={14} aria-hidden="true" /></button>)}</div>}
    </section>
  )
}
