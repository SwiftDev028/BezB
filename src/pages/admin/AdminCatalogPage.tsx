import { useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, Package, Pencil, Plus, Search, X } from 'lucide-react'
import { categories, categoryById } from '../../data/categories'
import { requireSupabase } from '../../services/supabase'
import { useCatalog } from '../../context/CatalogContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { btnPrimary, inputClass } from '../../components/common/ui'
import { EmptyState } from '../../components/common/EmptyState'
import { ConfirmDialog, Notice, PageHeader, Tag } from '../../components/admin/ui'
import { ProductEditor, blankForm, type EditorMode } from '../../components/admin/ProductEditor'
import {
  availabilityLabels, bestCosts, countByView, defaultAdminFilters, describeError, filterAdminProducts,
  isLive, margin, publicationLabels, variantKey, variantLabel,
  type AdminFilters, type AdminProduct, type Availability, type Cost, type ProductForm, type Publication, type StatusView,
} from '../../utils/adminCatalog'
import { formatPrice } from '../../utils/format'

type BulkAction = { label: string; patch: { publication_status?: Publication; availability?: Availability } }

const bulkActions: BulkAction[] = [
  { label: 'Опубликовать', patch: { publication_status: 'published' } },
  { label: 'Скрыть', patch: { publication_status: 'hidden' } },
  { label: 'В наличии', patch: { availability: 'in_stock' } },
  { label: 'Нет в наличии', patch: { availability: 'out_of_stock' } },
]

const viewLabels: Record<StatusView, string> = {
  all: 'Все',
  live: 'На сайте',
  draft: 'Черновики',
  hidden: 'Скрытые',
  no_stock: 'Нет в наличии',
}

const sortLabels: Record<AdminFilters['sort'], string> = {
  title: 'По названию',
  'price-asc': 'Сначала дешевле',
  'price-desc': 'Сначала дороже',
  updated: 'Недавно изменённые',
}

function toForm(p: AdminProduct): ProductForm {
  return {
    ...blankForm,
    product_id: p.product_id,
    slug: p.slug,
    group_id: p.group_id ?? '',
    title: p.title,
    brand: p.brand,
    platform: p.platform ?? '',
    category: p.category,
    product_type: p.product_type,
    region: p.region ?? '',
    denomination: p.denomination === null || p.denomination === undefined ? '' : String(Number(p.denomination)),
    denomination_currency: p.denomination_currency ?? '',
    unit_price: String(p.unit_price),
    image_url: p.image_url ?? '',
    description: p.description ?? '',
    activation_instructions: p.activation_instructions ?? '',
    restrictions: Array.isArray(p.restrictions) ? (p.restrictions as string[]).join('\n') : '',
    availability: p.availability,
    publication_status: p.publication_status,
  }
}

interface EditorState {
  mode: EditorMode
  initial: ProductForm
  original: { id: string; region: string } | null
  cost?: Cost
}

export default function AdminCatalogPage() {
  useDocumentTitle('Админ: товары')
  const { refresh: refreshPublic } = useCatalog()
  const [rows, setRows] = useState<AdminProduct[]>([])
  const [costs, setCosts] = useState<Map<string, Cost>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filters, setFilters] = useState<AdminFilters>(defaultAdminFilters)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [bulk, setBulk] = useState<BulkAction | null>(null)
  const [deleting, setDeleting] = useState<AdminProduct | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const db = requireSupabase()
      const [products, mappings] = await Promise.all([
        db.from('products').select('*').order('brand').order('title'),
        db.from('supplier_products').select('product_id,region,purchase_cost,purchase_currency,suppliers(name,status)'),
      ])
      if (products.error) throw products.error
      setRows((products.data ?? []) as AdminProduct[])
      // Себестоимость — справочная информация: если закупки недоступны, товары всё равно показываем
      setCosts(mappings.error ? new Map() : bestCosts((mappings.data ?? []) as never[]))
      setError('')
    } catch (e) {
      setError(describeError(e, 'Не удалось загрузить товары.'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const reloadAll = () => Promise.all([load(), refreshPublic()])
  const visible = useMemo(() => filterAdminProducts(rows, filters), [rows, filters])
  const counts = useMemo(() => countByView(rows), [rows])
  const regions = useMemo(() => [...new Set(rows.map((r) => r.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [rows])
  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')), [rows])
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(variantKey(r))), [rows, selected])
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(variantKey(r)))
  const filtersActive = filters.query.trim() !== '' || filters.view !== 'all' || filters.category !== 'all'

  const patchFilters = (patch: Partial<AdminFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setSelected(new Set()) // выбор не должен «прятаться» за фильтром и попадать в массовое действие
  }

  const open = (mode: EditorMode, p?: AdminProduct) => {
    setNotice('')
    if (!p) return setEditor({ mode, initial: blankForm, original: null })
    const cost = costs.get(variantKey(p))
    if (mode === 'edit') return setEditor({ mode, initial: toForm(p), original: { id: p.product_id, region: p.region ?? '' }, cost })
    // новый вариант в той же группе: копия без SKU/адреса, в черновике
    setEditor({
      mode,
      initial: { ...toForm(p), product_id: '', slug: '', region: '', denomination: '', publication_status: 'draft', availability: 'out_of_stock' },
      original: null,
    })
  }

  const quickToggle = async (p: AdminProduct) => {
    const next: Publication = p.publication_status === 'published' ? 'hidden' : 'published'
    setError(''); setNotice('')
    try {
      const { error: e } = await requireSupabase().from('products').update({ publication_status: next }).eq('product_id', p.product_id).eq('region', p.region)
      if (e) throw e
      setNotice(next === 'published' ? `«${p.title}» (${variantLabel(p)}) опубликован.` : `«${p.title}» (${variantLabel(p)}) скрыт с сайта.`)
      await reloadAll()
    } catch (e) {
      setError(describeError(e, 'Не удалось изменить публикацию.'))
    }
  }

  const runBulk = async () => {
    if (!bulk) return
    setBusy(true); setError(''); setNotice('')
    const db = requireSupabase()
    const results = await Promise.all(
      selectedRows.map((p) => db.from('products').update(bulk.patch).eq('product_id', p.product_id).eq('region', p.region)),
    )
    const failed = results.filter((r) => r.error)
    setBusy(false); setBulk(null)
    if (failed.length) setError(`Изменено ${results.length - failed.length} из ${results.length}. Ошибка: ${describeError(failed[0].error, 'неизвестная')}`)
    else setNotice(`Готово: «${bulk.label}» — ${results.length} шт.`)
    setSelected(new Set())
    await reloadAll()
  }

  const runDelete = async () => {
    if (!deleting) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: e } = await requireSupabase().from('products').delete().eq('product_id', deleting.product_id).eq('region', deleting.region)
      if (e) throw e
      setNotice(`Вариант «${deleting.title}» (${variantLabel(deleting)}) удалён.`)
      setDeleting(null); setEditor(null)
      await reloadAll()
    } catch (e) {
      setDeleting(null)
      setError(`${describeError(e, 'Не удалось удалить вариант.')} Вместо удаления можно скрыть товар.`)
    } finally {
      setBusy(false)
    }
  }

  const toggleRow = (p: AdminProduct) =>
    setSelected((s) => {
      const next = new Set(s)
      const key = variantKey(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map(variantKey)))

  const gridCols = 'lg:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1.4fr)_7rem_8.5rem_9.5rem_12rem]'

  return (
    <section>
      <PageHeader
        title="Товары"
        description="Каждая строка — один продаваемый вариант (регион и номинал). Покупатели видят только опубликованные товары в наличии."
        actions={<button type="button" className={btnPrimary} onClick={() => open('create')}><Plus className="size-5" aria-hidden="true" />Новый товар</button>}
      />

      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}

      <div role="group" aria-label="Фильтр по статусу" className="mb-4 flex flex-wrap gap-2">
        {(Object.keys(viewLabels) as StatusView[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={filters.view === v}
            onClick={() => patchFilters({ view: v })}
            className={`inline-flex min-h-11 items-center gap-2 border px-3.5 text-sm font-semibold ${filters.view === v ? 'border-red bg-red text-white' : 'border-line bg-graphite hover:border-silver'}`}
          >
            {viewLabels[v]}
            <span className={`text-xs font-normal ${filters.view === v ? 'text-white/80' : 'text-silver'}`}>{counts[v]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 border border-line bg-coal p-3 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
        <div className="relative col-span-2 lg:col-span-1">
          <label htmlFor="adm-q" className="sr-only">Поиск товаров</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver" aria-hidden="true" />
          <input id="adm-q" type="search" value={filters.query} onChange={(e) => patchFilters({ query: e.target.value })} placeholder="Название, SKU, бренд, регион, номинал" className={`${inputClass} pl-9`} />
        </div>
        <div>
          <label htmlFor="adm-cat" className="sr-only">Категория</label>
          <select id="adm-cat" value={filters.category} onChange={(e) => patchFilters({ category: e.target.value })} className={inputClass}>
            <option value="all">Все категории</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="adm-sort" className="sr-only">Сортировка</label>
          <select id="adm-sort" value={filters.sort} onChange={(e) => patchFilters({ sort: e.target.value as AdminFilters['sort'] })} className={inputClass}>
            {Object.entries(sortLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => patchFilters(defaultAdminFilters)} disabled={!filtersActive && filters.sort === 'title'} className="inline-flex min-h-11 items-center justify-center gap-2 border border-line px-4 text-sm text-silver hover:border-silver hover:text-white disabled:opacity-50 col-span-2 lg:col-span-1">
          <X className="size-4" aria-hidden="true" />Сбросить
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-silver" aria-live="polite">
        <span>Показано: <strong className="text-white">{visible.length}</strong> из {rows.length}</span>
        {selected.size > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            <strong className="text-white">Выбрано: {selected.size}</strong>
            {bulkActions.map((a) => (
              <button key={a.label} type="button" onClick={() => setBulk(a)} className="min-h-9 border border-line bg-graphite px-3 text-white hover:border-silver">{a.label}</button>
            ))}
            <button type="button" onClick={() => setSelected(new Set())} className="min-h-9 px-2 underline hover:text-white">Снять выбор</button>
          </span>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <p role="status" className="py-8 text-silver">Загружаем товары…</p>
      ) : visible.length === 0 ? (
        <EmptyState icon={Package} title={rows.length === 0 ? 'Каталог пока пуст' : 'Ничего не найдено'} text={rows.length === 0 ? 'Создайте первый товар кнопкой «Новый товар».' : 'Измените запрос или сбросьте фильтры.'} />
      ) : (
        <div>
          <div aria-hidden="true" className={`hidden gap-3 border-b border-line px-3 pb-2 text-xs uppercase tracking-wider text-silver lg:grid ${gridCols}`}>
            <span /><span>Товар</span><span>Вариант</span><span>Цена</span><span>Закупка</span><span>Статус</span><span className="text-right">Действия</span>
          </div>
          <ul className="divide-y divide-line border border-line bg-coal lg:border-t-0">
            {visible.map((p) => {
              const key = variantKey(p)
              const cost = costs.get(key)
              const m = margin(Number(p.unit_price), cost)
              const live = isLive(p)
              return (
                <li key={key} className={`grid items-center gap-x-3 gap-y-2 p-3 hover:bg-graphite ${gridCols}`}>
                  <div className="flex items-center gap-3 lg:contents">
                    <label className="grid size-11 shrink-0 cursor-pointer place-items-center lg:size-8">
                      <input type="checkbox" checked={selected.has(key)} onChange={() => toggleRow(p)} className="size-5 accent-red" aria-label={`Выбрать: ${p.title}, ${variantLabel(p)}`} />
                    </label>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{p.title}</p>
                      <p className="break-all text-xs text-silver">{p.product_id}</p>
                    </div>
                  </div>
                  <p className="min-w-0 break-words text-sm text-silver">
                    {categoryById[p.category as keyof typeof categoryById]?.title ?? p.category} · {p.brand}
                    <span className="block text-white">{variantLabel(p)}</span>
                  </p>
                  <p className="text-sm lg:block">
                    <span className="mr-2 text-xs uppercase text-silver lg:hidden">Цена продажи</span>
                    <strong className="font-display text-lg">{formatPrice(Number(p.unit_price))}</strong>
                  </p>
                  <p className="text-sm text-silver">
                    <span className="mr-2 text-xs uppercase lg:hidden">Закупка</span>
                    {cost ? (
                      <>
                        {cost.cost} {cost.currency}
                        {m && <span className={`block text-xs ${m.profit <= 0 ? 'text-red-hot' : ''}`}>маржа {m.percent.toFixed(0)}%</span>}
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Tag tone={live ? 'strong' : 'muted'}>{live ? 'На сайте' : 'Не на сайте'}</Tag>
                    <Tag tone={p.publication_status === 'published' ? 'neutral' : 'danger'}>{publicationLabels[p.publication_status] ?? p.publication_status}</Tag>
                    <Tag>{availabilityLabels[p.availability] ?? p.availability}</Tag>
                  </div>
                  <div className="flex flex-wrap gap-1 lg:justify-end">
                    <button type="button" onClick={() => open('edit', p)} className="inline-flex min-h-11 items-center gap-1.5 border border-line bg-graphite px-3 text-sm hover:border-silver" aria-label={`Изменить: ${p.title}, ${variantLabel(p)}`}>
                      <Pencil className="size-4" aria-hidden="true" />Изменить
                    </button>
                    <button type="button" onClick={() => void quickToggle(p)} className="grid size-11 place-items-center border border-line bg-graphite hover:border-silver" aria-label={p.publication_status === 'published' ? `Скрыть с сайта: ${p.title}, ${variantLabel(p)}` : `Опубликовать: ${p.title}, ${variantLabel(p)}`} title={p.publication_status === 'published' ? 'Скрыть с сайта' : 'Опубликовать'}>
                      {p.publication_status === 'published' ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={() => open('duplicate', p)} className="grid size-11 place-items-center border border-line bg-graphite hover:border-silver" aria-label={`Добавить вариант в группу: ${p.title}`} title="Новый регион / номинал">
                      <Copy className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-silver">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="size-5 accent-red" />
            Выбрать все показанные ({visible.length})
          </label>
        </div>
      )}

      {editor && (
        <ProductEditor
          key={`${editor.mode}:${editor.original?.id ?? 'new'}:${editor.original?.region ?? ''}`}
          mode={editor.mode}
          initial={editor.initial}
          original={editor.original}
          cost={editor.cost}
          regions={regions}
          brands={brands}
          onClose={() => setEditor(null)}
          onSaved={(message) => { setEditor(null); setNotice(message); void reloadAll() }}
          onDelete={editor.original ? () => setDeleting(rows.find((r) => r.product_id === editor.original!.id && (r.region ?? '') === editor.original!.region) ?? null) : undefined}
        />
      )}

      {bulk && (
        <ConfirmDialog title={`${bulk.label}: ${selectedRows.length} шт.`} confirmLabel={`Применить к ${selectedRows.length}`} busy={busy} onConfirm={() => void runBulk()} onCancel={() => setBulk(null)}>
          <p>Действие будет применено ко всем выбранным вариантам и сразу отразится на сайте.</p>
          <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
            {selectedRows.slice(0, 12).map((p) => <li key={variantKey(p)}>{p.title} — {variantLabel(p)}</li>)}
          </ul>
          {selectedRows.length > 12 && <p>…и ещё {selectedRows.length - 12}.</p>}
          {bulk.patch.publication_status === 'published' && selectedRows.some((p) => !p.image_url) && (
            <p className="text-red-hot">У некоторых выбранных товаров нет изображения.</p>
          )}
        </ConfirmDialog>
      )}

      {deleting && (
        <ConfirmDialog title="Удалить вариант?" confirmLabel="Удалить навсегда" danger requireText={deleting.product_id} busy={busy} onConfirm={() => void runDelete()} onCancel={() => setDeleting(null)}>
          <p><strong className="text-white">{deleting.title}</strong> — {variantLabel(deleting)}. Удаление необратимо и невозможно, если на вариант ссылаются коды, закупки или заказы.</p>
          <p>Если товар нужно просто убрать с сайта, скройте его — это обратимо.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
