import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Plus, Search, Truck } from 'lucide-react'
import { requireSupabase } from '../../services/supabase'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { btnPrimary, btnSecondary, inputClass } from '../../components/common/ui'
import { EmptyState } from '../../components/common/EmptyState'
import { ConfirmDialog, Field, Modal, Notice, PageHeader, Panel, Tag } from '../../components/admin/ui'
import { describeError, margin, variantKey } from '../../utils/adminCatalog'
import { formatPrice } from '../../utils/format'

type Row = Record<string, any>

export default function AdminSuppliersPage() {
  useDocumentTitle('Админ: поставщики')
  const [suppliers, setSuppliers] = useState<Row[]>([])
  const [variants, setVariants] = useState<Row[]>([])
  const [mappings, setMappings] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'supplier' | 'mapping' | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [deactivating, setDeactivating] = useState<Row | null>(null)

  const load = useCallback(async () => {
    try {
      const db = requireSupabase()
      const [s, p, m] = await Promise.all([
        db.from('suppliers').select('*').order('name'),
        db.from('products').select('product_id,region,title,brand,unit_price').order('title'),
        db.from('supplier_products').select('*,suppliers(name),products(title)').order('cost_updated_at', { ascending: false }),
      ])
      for (const r of [s, p, m]) if (r.error) throw r.error
      setSuppliers(s.data ?? []); setVariants(p.data ?? []); setMappings(m.data ?? [])
    } catch (e) {
      setError(describeError(e, 'Не удалось загрузить поставщиков.'))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const priceByVariant = useMemo(() => new Map(variants.map((v) => [variantKey(v as never), Number(v.unit_price)])), [variants])
  const shownMappings = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return mappings.filter((m) => {
      const hay = [m.products?.title, m.product_id, m.region, m.suppliers?.name, m.supplier_sku].join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [mappings, query])

  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(success); await load(); return true }
    catch (e) { setError(describeError(e, 'Операция не выполнена.')); return false }
    finally { setBusy(false) }
  }

  const toggleSupplier = (s: Row) =>
    run(async () => {
      const { error: e } = await requireSupabase().from('suppliers').update({ status: s.status === 'active' ? 'inactive' : 'active', updated_at: new Date().toISOString() }).eq('id', s.id)
      if (e) throw e
    }, s.status === 'active' ? `Поставщик «${s.name}» отключён.` : `Поставщик «${s.name}» активирован.`)

  return (
    <section>
      <PageHeader
        title="Поставщики и себестоимость"
        description="Здесь хранится закупочная стоимость (себестоимость) товаров. Цена продажи для покупателей меняется в разделе «Товары». Не сохраняйте пароли и API-секреты."
        actions={
          <>
            <button type="button" className={btnSecondary} onClick={() => setDialog('supplier')}><Plus className="size-5" aria-hidden="true" />Поставщик</button>
            <button type="button" className={btnPrimary} onClick={() => setDialog('mapping')} disabled={!suppliers.length || !variants.length}><Plus className="size-5" aria-hidden="true" />Закупочная цена</button>
          </>
        }
      />
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}

      <Panel title="Поставщики" className="mb-8">
        {suppliers.length === 0 ? (
          <p className="text-sm text-silver">Поставщиков пока нет. Добавьте первого кнопкой «Поставщик».</p>
        ) : (
          <ul className="divide-y divide-line border border-line">
            {suppliers.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2"><strong className="break-words text-base">{s.name}</strong><Tag tone={s.status === 'active' ? 'strong' : 'muted'}>{s.status === 'active' ? 'Активен' : 'Отключён'}</Tag></p>
                  {s.contact_url && <a className="break-all text-silver underline hover:text-white" href={s.contact_url} target="_blank" rel="noreferrer">Открыть контакт</a>}
                  {s.internal_notes && <p className="mt-1 whitespace-pre-line break-words text-xs text-silver">{s.internal_notes}</p>}
                </div>
                <button type="button" disabled={busy} onClick={() => (s.status === 'active' ? setDeactivating(s) : void toggleSupplier(s))} className={btnSecondary}>
                  {s.status === 'active' ? 'Отключить' : 'Активировать'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <h2 className="mb-3 text-2xl">Закупочные цены (себестоимость)</h2>
      <div className="relative mb-3">
        <label htmlFor="sup-q" className="sr-only">Поиск по закупкам</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver" aria-hidden="true" />
        <input id="sup-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Товар, поставщик, артикул" className={`${inputClass} pl-9`} />
      </div>
      {shownMappings.length === 0 ? (
        <EmptyState icon={Truck} title={mappings.length === 0 ? 'Закупочных цен пока нет' : 'Ничего не найдено'} text={mappings.length === 0 ? 'Сопоставьте товар с поставщиком, чтобы видеть маржу в каталоге.' : 'Измените запрос.'} />
      ) : (
        <div>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_8rem_7rem_9rem] gap-3 border-b border-line px-3 pb-2 text-xs uppercase tracking-wider text-silver lg:grid">
            <span>Товар / вариант</span><span>Поставщик · артикул</span><span>Себестоимость</span><span>Цена продажи</span><span>Маржа</span><span className="text-right">Действие</span>
          </div>
          <ul className="divide-y divide-line border border-line bg-coal lg:border-t-0">
            {shownMappings.map((m) => {
              const price = priceByVariant.get(variantKey(m as never))
              const mg = price ? margin(price, { cost: Number(m.purchase_cost), currency: m.purchase_currency, supplier: '' }) : null
              return (
                <li key={m.id} className="grid items-center gap-x-3 gap-y-1 p-3 text-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_8rem_7rem_9rem]">
                  <p className="min-w-0 break-words"><strong>{m.products?.title ?? m.product_id}</strong><span className="block text-xs text-silver">{m.region || 'без региона'} · {m.product_id}</span></p>
                  <p className="min-w-0 break-words text-silver">{m.suppliers?.name}<span className="block break-all text-xs">{m.supplier_sku}</span></p>
                  <p><span className="mr-2 text-xs uppercase text-silver lg:hidden">Себестоимость</span><strong>{m.purchase_cost} {m.purchase_currency}</strong><span className="block text-xs text-silver">обновлено {new Date(m.cost_updated_at).toLocaleDateString('ru-RU')}</span></p>
                  <p><span className="mr-2 text-xs uppercase text-silver lg:hidden">Цена продажи</span>{price ? formatPrice(price) : '—'}</p>
                  <p className={mg && mg.profit <= 0 ? 'text-red-hot' : ''}><span className="mr-2 text-xs uppercase text-silver lg:hidden">Маржа</span>{mg ? `${mg.percent.toFixed(0)}%` : '—'}</p>
                  <div className="lg:text-right"><button type="button" className="min-h-11 border border-line bg-graphite px-3 hover:border-silver" onClick={() => setEditing(m)}>Изменить закупку</button></div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {dialog === 'supplier' && <SupplierDialog busy={busy} onClose={() => setDialog(null)} onSubmit={(v) => run(async () => {
        const { error: e } = await requireSupabase().from('suppliers').insert(v); if (e) throw e
      }, 'Поставщик сохранён.').then((ok) => ok && setDialog(null))} />}
      {dialog === 'mapping' && <MappingDialog busy={busy} suppliers={suppliers.filter((s) => s.status === 'active')} variants={variants} onClose={() => setDialog(null)} onSubmit={(v) => run(async () => {
        const { error: e } = await requireSupabase().from('supplier_products').insert(v); if (e) throw e
      }, 'Закупочная цена сохранена.').then((ok) => ok && setDialog(null))} />}
      {editing && <CostDialog row={editing} busy={busy} onClose={() => setEditing(null)} onSubmit={(cost) => run(async () => {
        const { error: e } = await requireSupabase().from('supplier_products').update({ purchase_cost: cost, cost_updated_at: new Date().toISOString() }).eq('id', editing.id); if (e) throw e
      }, 'Закупочная стоимость обновлена.').then((ok) => ok && setEditing(null))} />}
      {deactivating && (
        <ConfirmDialog title="Отключить поставщика?" confirmLabel="Отключить" busy={busy} onCancel={() => setDeactivating(null)} onConfirm={() => void toggleSupplier(deactivating).then(() => setDeactivating(null))}>
          <p>«{deactivating.name}» перестанет предлагаться при добавлении закупочных цен, а его цены не будут учитываться в марже каталога. Данные сохранятся, поставщика можно включить снова.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

function SupplierDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (v: Row) => void }) {
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [notes, setNotes] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit({ name: name.trim(), contact_url: contact.trim() || null, internal_notes: notes }) }
  return (
    <Modal title="Новый поставщик" onClose={onClose} footer={<><button type="button" className={btnSecondary} onClick={onClose}>Отмена</button><button type="submit" form="supplier-form" className={btnPrimary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></>}>
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        <Field label="Название" htmlFor="sup-name"><input id="sup-name" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field label="Контакт или ссылка на кабинет" htmlFor="sup-contact"><input id="sup-contact" type="url" value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} /></Field>
        <Field label="Внутреннее примечание" htmlFor="sup-notes"><textarea id="sup-notes" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} min-h-20 py-2`} /></Field>
      </form>
    </Modal>
  )
}

function MappingDialog({ busy, suppliers, variants, onClose, onSubmit }: { busy: boolean; suppliers: Row[]; variants: Row[]; onClose: () => void; onSubmit: (v: Row) => void }) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [variant, setVariant] = useState(variants[0] ? variantKey(variants[0] as never) : '')
  const [sku, setSku] = useState(''); const [cost, setCost] = useState(''); const [currency, setCurrency] = useState('RUB'); const [note, setNote] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const [product_id, region] = variant.split('|')
    onSubmit({ supplier_id: supplierId, product_id, region, supplier_sku: sku.trim(), purchase_cost: Number(cost), purchase_currency: currency, internal_notes: note })
  }
  return (
    <Modal wide title="Закупочная цена (себестоимость)" onClose={onClose} footer={<><button type="button" className={btnSecondary} onClick={onClose}>Отмена</button><button type="submit" form="mapping-form" className={btnPrimary} disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></>}>
      <form id="mapping-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Поставщик" htmlFor="map-sup"><select id="map-sup" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Вариант товара BezB" htmlFor="map-var"><select id="map-var" required value={variant} onChange={(e) => setVariant(e.target.value)} className={inputClass}>{variants.map((p) => <option key={variantKey(p as never)} value={variantKey(p as never)}>{p.title} · {p.region || 'без региона'}</option>)}</select></Field>
        <Field label="Артикул поставщика" htmlFor="map-sku"><input id="map-sku" required value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} /></Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Закупка" htmlFor="map-cost"><input id="map-cost" required min="0" step="0.01" type="number" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} /></Field>
          <Field label="Валюта" htmlFor="map-cur"><input id="map-cur" required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} className={inputClass} /></Field>
        </div>
        <Field label="Внутреннее примечание" htmlFor="map-note" className="sm:col-span-2"><textarea id="map-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} min-h-20 py-2`} /></Field>
      </form>
    </Modal>
  )
}

function CostDialog({ row, busy, onClose, onSubmit }: { row: Row; busy: boolean; onClose: () => void; onSubmit: (cost: number) => void }) {
  const [value, setValue] = useState(String(row.purchase_cost))
  const cost = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(cost) && cost >= 0
  return (
    <Modal title="Закупочная стоимость" onClose={onClose} footer={<><button type="button" className={btnSecondary} onClick={onClose}>Отмена</button><button type="submit" form="cost-form" className={btnPrimary} disabled={busy || !valid}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></>}>
      <form id="cost-form" onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(cost) }} className="space-y-3">
        <p className="text-sm text-silver">{row.products?.title ?? row.product_id} · {row.region || 'без региона'} · {row.suppliers?.name}</p>
        <Field label={`Новая себестоимость, ${row.purchase_currency}`} htmlFor="cost-v" error={valid ? undefined : 'Укажите число не меньше нуля.'} hint={`Сейчас: ${row.purchase_cost} ${row.purchase_currency}. Цену продажи это не меняет.`}>
          <input id="cost-v" type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} autoFocus />
        </Field>
      </form>
    </Modal>
  )
}
