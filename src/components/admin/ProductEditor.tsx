import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { categories, categoryById, typeLabels } from '../../data/categories'
import type { CategoryId } from '../../types'
import { requireSupabase } from '../../services/supabase'
import {
  availabilityLabels, describeError, isLive, margin, publicationLabels, publishWarnings, suggestIds, validateProductForm,
  type Availability, type Cost, type ProductForm, type Publication,
} from '../../utils/adminCatalog'
import { formatPrice } from '../../utils/format'
import { btnPrimary, btnSecondary, inputClass } from '../common/ui'
import { ConfirmDialog, Field, Modal, Notice, Tag } from './ui'

export type EditorMode = 'create' | 'edit' | 'duplicate'

export const blankForm: ProductForm = {
  product_id: '', slug: '', group_id: '', title: '', brand: '', platform: '', category: 'apple', product_type: 'gift-card',
  region: '', denomination: '', denomination_currency: '', unit_price: '', image_url: '', description: '',
  activation_instructions: '', restrictions: '', availability: 'out_of_stock', publication_status: 'draft',
}

interface ProductEditorProps {
  mode: EditorMode
  initial: ProductForm
  /** Ключ редактируемой строки (SKU + регион) — по нему обновляем запись */
  original: { id: string; region: string } | null
  cost?: Cost
  regions: string[]
  brands: string[]
  onClose: () => void
  onSaved: (message: string) => void
  onDelete?: () => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="mb-3 font-display text-lg uppercase tracking-wide text-white">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

const titles: Record<EditorMode, string> = {
  create: 'Новый товар',
  edit: 'Редактирование варианта',
  duplicate: 'Новый вариант в группе',
}

export function ProductEditor({ mode, initial, original, cost, regions, brands, onClose, onSaved, onDelete }: ProductEditorProps) {
  const uid = useId()
  const id = (n: string) => `${uid}-${n}`
  const [form, setForm] = useState<ProductForm>(initial)
  // Пока администратор сам не правил SKU/адрес, предлагаем их из названия, региона и номинала
  const [idsTouched, setIdsTouched] = useState(mode === 'edit')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [imageBroken, setImageBroken] = useState(false)

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])
  const errors = validateProductForm(form)
  const shown = submitted ? errors : {}
  const warnings = publishWarnings(form, cost)
  const price = Number(form.unit_price)
  const m = margin(price, cost)
  const live = isLive(form)
  const typeOptions = categoryById[form.category as CategoryId]?.types ?? []
  const typeList = typeOptions.includes(form.product_type as never) ? typeOptions : [...typeOptions, form.product_type as never]

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (!idsTouched && (key === 'title' || key === 'region' || key === 'denomination' || key === 'denomination_currency')) {
        Object.assign(next, suggestIds(next.title, next.region, next.denomination, next.denomination_currency))
      }
      return next
    })

  const setCategory = (category: string) =>
    setForm((f) => {
      const types = categoryById[category as CategoryId]?.types ?? []
      return { ...f, category, product_type: types.includes(f.product_type as never) ? f.product_type : (types[0] ?? f.product_type) }
    })

  const attempt = () => (dirty ? setConfirmClose(true) : onClose())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setError('')
    if (Object.keys(errors).length > 0) {
      // после перерисовки переводим фокус на первое поле с ошибкой
      window.setTimeout(() => document.getElementById(id('form'))?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setBusy(true)
    try {
      const values = {
        product_id: form.product_id.trim(),
        slug: form.slug.trim(),
        group_id: form.group_id || crypto.randomUUID(),
        title: form.title.trim(),
        brand: form.brand.trim(),
        platform: form.platform.trim(),
        category: form.category,
        product_type: form.product_type,
        region: form.region.trim(),
        denomination: form.denomination === '' ? null : Number(form.denomination),
        denomination_currency: form.denomination_currency.trim() || null,
        unit_price: Number(form.unit_price),
        currency: 'RUB',
        description: form.description.trim(),
        image_url: form.image_url.trim() || null,
        activation_instructions: form.activation_instructions.trim(),
        restrictions: form.restrictions.split('\n').map((x) => x.trim()).filter(Boolean),
        availability: form.availability,
        publication_status: form.publication_status,
      }
      const db = requireSupabase()
      const result =
        mode === 'edit' && original
          ? await db.from('products').update(values).eq('product_id', original.id).eq('region', original.region)
          : await db.from('products').insert(values)
      if (result.error) throw result.error
      onSaved(mode === 'edit' ? `Изменения сохранены: «${values.title}».` : `Создано: «${values.title}» (${live ? 'товар виден покупателям' : 'пока не виден покупателям'}).`)
    } catch (err) {
      setError(describeError(err, 'Не удалось сохранить товар.'))
    } finally {
      setBusy(false)
    }
  }

  const err = (key: keyof ProductForm) => shown[key]
  const aria = (key: keyof ProductForm) => ({
    'aria-invalid': err(key) ? true : undefined,
    'aria-describedby': err(key) ? `${id(key)}-err` : undefined,
    id: id(key),
  })

  return (
    <>
      <Modal
        side
        title={titles[mode]}
        onClose={attempt}
        footer={
          <>
            {mode === 'edit' && onDelete && (
              <button type="button" onClick={onDelete} className="mr-auto inline-flex min-h-11 items-center gap-2 px-3 text-sm text-red-hot hover:underline">
                <Trash2 className="size-4" aria-hidden="true" />Удалить вариант
              </button>
            )}
            <button type="button" className={btnSecondary} onClick={attempt}>Отмена</button>
            <button type="submit" form={id('form')} className={btnPrimary} disabled={busy}>
              {busy ? 'Сохраняем…' : mode === 'edit' ? 'Сохранить изменения' : 'Создать'}
            </button>
          </>
        }
      >
        <form id={id('form')} onSubmit={submit} noValidate className="space-y-6">
          {error && <Notice tone="error">{error}</Notice>}
          {submitted && Object.keys(errors).length > 0 && <Notice tone="error">Проверьте поля, отмеченные красным.</Notice>}

          <Section title="Основное">
            <Field label="Название" htmlFor={id('title')} error={err('title')} className="sm:col-span-2">
              <input {...aria('title')} value={form.title} onChange={(e) => set('title', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Категория" htmlFor={id('category')}>
              <select id={id('category')} value={form.category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </Field>
            <Field label="Тип товара" htmlFor={id('product_type')}>
              <select id={id('product_type')} value={form.product_type} onChange={(e) => set('product_type', e.target.value)} className={inputClass}>
                {typeList.map((t) => <option key={t} value={t}>{typeLabels[t as keyof typeof typeLabels] ?? t}</option>)}
              </select>
            </Field>
            <Field label="Бренд / сервис" htmlFor={id('brand')} error={err('brand')} hint="Например: Apple, ChatGPT, Xbox">
              <input {...aria('brand')} list={id('brands')} value={form.brand} onChange={(e) => set('brand', e.target.value)} className={inputClass} />
              <datalist id={id('brands')}>{brands.map((b) => <option key={b} value={b} />)}</datalist>
            </Field>
            <Field label="Платформа" htmlFor={id('platform')} hint="Например: Xbox Series X|S, ПК">
              <input id={id('platform')} value={form.platform} onChange={(e) => set('platform', e.target.value)} className={inputClass} />
            </Field>
          </Section>

          <Section title="Регион и номинал">
            <Field label="Регион" htmlFor={id('region')} hint="Пусто — товар без региона">
              <input id={id('region')} list={id('regions')} value={form.region} onChange={(e) => set('region', e.target.value)} className={inputClass} />
              <datalist id={id('regions')}>{regions.map((r) => <option key={r} value={r} />)}</datalist>
            </Field>
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <Field label="Номинал" htmlFor={id('denomination')} error={err('denomination')}>
                <input {...aria('denomination')} type="number" inputMode="decimal" min="0" step="any" value={form.denomination} onChange={(e) => set('denomination', e.target.value)} className={inputClass} />
              </Field>
              <Field label="Валюта" htmlFor={id('denomination_currency')} error={err('denomination_currency')}>
                <input {...aria('denomination_currency')} list={id('currencies')} maxLength={3} value={form.denomination_currency} onChange={(e) => set('denomination_currency', e.target.value.toUpperCase())} className={inputClass} />
                <datalist id={id('currencies')}>{['RUB', 'USD', 'EUR', 'TRY', 'KZT'].map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
            </div>
          </Section>

          <Section title="Цена и себестоимость">
            <Field label="Цена продажи, ₽" htmlFor={id('unit_price')} error={err('unit_price')} hint="Эту цену платит покупатель">
              <input {...aria('unit_price')} type="number" inputMode="decimal" min="0" step="0.01" value={form.unit_price} onChange={(e) => set('unit_price', e.target.value)} className={inputClass} />
            </Field>
            <div className="border border-line bg-coal p-3 text-sm" aria-live="polite">
              <p className="text-xs font-semibold uppercase tracking-wider text-silver">Себестоимость (закупка)</p>
              {cost ? (
                <>
                  <p className="mt-1 text-base font-semibold text-white">{cost.cost} {cost.currency}</p>
                  <p className="text-xs text-silver">Поставщик: {cost.supplier || '—'}. Меняется в разделе «Поставщики».</p>
                  {m ? (
                    <p className={`mt-2 ${m.profit <= 0 ? 'text-red-hot' : 'text-white'}`}>
                      Прибыль: {formatPrice(Math.round(m.profit))} ({m.percent.toFixed(0)}%)
                    </p>
                  ) : cost.currency !== 'RUB' ? (
                    <p className="mt-2 text-silver">Закупка не в рублях — маржа не считается.</p>
                  ) : null}
                </>
              ) : (
                <p className="mt-1 text-silver">Не указана. Добавьте в разделе «Поставщики».</p>
              )}
            </div>
          </Section>

          <Section title="Публикация и наличие">
            <Field label="Публикация" htmlFor={id('publication_status')}>
              <select id={id('publication_status')} value={form.publication_status} onChange={(e) => set('publication_status', e.target.value as Publication)} className={inputClass}>
                {Object.entries(publicationLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Наличие" htmlFor={id('availability')}>
              <select id={id('availability')} value={form.availability} onChange={(e) => set('availability', e.target.value as Availability)} className={inputClass}>
                {Object.entries(availabilityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <p className="flex flex-wrap items-center gap-2 text-sm text-silver sm:col-span-2">
              <Tag tone={live ? 'strong' : 'muted'}>{live ? 'Виден покупателям' : 'Не виден покупателям'}</Tag>
              Покупатели видят вариант, только если он «Опубликован» и «В наличии».
            </p>
            {warnings.length > 0 && (
              <ul className="list-disc space-y-1 border border-line bg-coal p-3 pl-7 text-sm text-silver sm:col-span-2">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </Section>

          <Section title="Изображение">
            <Field label="Ссылка на изображение (https)" htmlFor={id('image_url')} error={err('image_url')} className="sm:col-span-2">
              <input {...aria('image_url')} type="url" value={form.image_url} onChange={(e) => { setImageBroken(false); set('image_url', e.target.value) }} className={inputClass} />
            </Field>
            {form.image_url.trim() && !err('image_url') && (
              <div className="sm:col-span-2">
                {imageBroken ? (
                  <p className="text-sm text-red-hot">Изображение не загрузилось. Проверьте ссылку.</p>
                ) : (
                  <img src={form.image_url.trim()} alt="Предпросмотр изображения товара" onError={() => setImageBroken(true)} className="max-h-40 max-w-full border border-line object-contain" />
                )}
              </div>
            )}
          </Section>

          <Section title="Описание для покупателя">
            <Field label="Описание" htmlFor={id('description')} className="sm:col-span-2">
              <textarea id={id('description')} value={form.description} onChange={(e) => set('description', e.target.value)} className={`${inputClass} min-h-24 py-2`} />
            </Field>
            <Field label="Инструкция по активации" htmlFor={id('activation_instructions')} className="sm:col-span-2">
              <textarea id={id('activation_instructions')} value={form.activation_instructions} onChange={(e) => set('activation_instructions', e.target.value)} className={`${inputClass} min-h-24 py-2`} />
            </Field>
            <Field label="Ограничения" htmlFor={id('restrictions')} hint="Каждое с новой строки" className="sm:col-span-2">
              <textarea id={id('restrictions')} value={form.restrictions} onChange={(e) => set('restrictions', e.target.value)} className={`${inputClass} min-h-20 py-2`} />
            </Field>
          </Section>

          <details className="border border-line bg-coal p-3" open={Boolean(shown.product_id || shown.slug)}>
            <summary className="cursor-pointer text-sm font-semibold text-white">Технические поля (SKU, адрес страницы, группа)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="SKU варианта" htmlFor={id('product_id')} error={err('product_id')} hint={mode === 'edit' ? 'Смена SKU обновит связанные коды и закупки.' : 'Уникальный артикул BezB'}>
                <input {...aria('product_id')} value={form.product_id} onChange={(e) => { setIdsTouched(true); set('product_id', e.target.value) }} className={inputClass} />
              </Field>
              <Field label="Адрес страницы (slug)" htmlFor={id('slug')} error={err('slug')} hint="Будет в ссылке: /product/…">
                <input {...aria('slug')} value={form.slug} onChange={(e) => { setIdsTouched(true); set('slug', e.target.value) }} className={inputClass} />
              </Field>
              <Field label="ID группы" htmlFor={id('group_id')} hint="Связывает регионы и номиналы одного товара. Пусто — новая группа." className="sm:col-span-2">
                <input id={id('group_id')} value={form.group_id} onChange={(e) => set('group_id', e.target.value)} className={inputClass} />
              </Field>
            </div>
          </details>
        </form>
      </Modal>
      {confirmClose && (
        <ConfirmDialog title="Закрыть без сохранения?" confirmLabel="Закрыть без сохранения" danger onConfirm={onClose} onCancel={() => setConfirmClose(false)}>
          <p>Внесённые изменения будут потеряны.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
