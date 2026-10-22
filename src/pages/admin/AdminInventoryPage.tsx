import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { KeyRound, Plus, Search } from 'lucide-react'
import { requireSupabase } from '../../services/supabase'
import { useAuth } from '../../context/AuthContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { btnPrimary, btnSecondary, inputClass } from '../../components/common/ui'
import { EmptyState } from '../../components/common/EmptyState'
import { ConfirmDialog, Field, Modal, Notice, PageHeader, Tag } from '../../components/admin/ui'
import { describeError } from '../../utils/adminCatalog'

type Row = Record<string, any>

const statusLabels: Record<string, string> = { available: 'Свободен', reserved: 'Зарезервирован', delivered: 'Выдан', void: 'Списан' }
const statusTone = { available: 'strong', reserved: 'muted', delivered: 'neutral', void: 'danger' } as const
const LIMIT = 200

export default function AdminInventoryPage() {
  useDocumentTitle('Админ: цифровые коды')
  const { user } = useAuth()
  const [products, setProducts] = useState<Row[]>([])
  const [codes, setCodes] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [voiding, setVoiding] = useState<Row | null>(null)
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    try {
      const db = requireSupabase()
      const [p, c] = await Promise.all([
        db.from('products').select('product_id,region,title,brand,publication_status,availability').order('title'),
        db.from('digital_codes').select('id,product_id,region,status,created_at,internal_note').order('created_at', { ascending: false }).limit(LIMIT),
      ])
      if (p.error) throw p.error
      if (c.error) throw c.error
      setProducts(p.data ?? []); setCodes(c.data ?? [])
    } catch (e) {
      setError(describeError(e, 'Не удалось загрузить склад.'))
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const titleOf = useCallback((c: Row) => products.find((p) => p.product_id === c.product_id && p.region === c.region)?.title ?? c.product_id, [products])
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: codes.length, available: 0, reserved: 0, delivered: 0, void: 0 }
    for (const c of codes) result[c.status] = (result[c.status] ?? 0) + 1
    return result
  }, [codes])
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return codes.filter((c) => (status === 'all' || c.status === status) && words.every((w) => [titleOf(c), c.region, c.internal_note].join(' ').toLowerCase().includes(w)))
  }, [codes, status, query, titleOf])

  const add = async (variant: string, secret: string, note: string) => {
    if (!user) return
    setBusy(true); setError(''); setNotice('')
    try {
      const [product_id, region] = variant.split('|')
      const { error: e } = await requireSupabase().from('digital_codes').insert({ product_id, region, secret_code: secret.trim(), created_by: user.id, internal_note: note.trim() })
      if (e) throw e
      setNotice('Код добавлен в закрытый склад.'); setAdding(false); await load()
    } catch (e) {
      setError(describeError(e, 'Не удалось сохранить код.'))
    } finally { setBusy(false) }
  }

  const voidCode = async () => {
    if (!voiding) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: e } = await requireSupabase().from('digital_codes').update({ status: 'void' }).eq('id', voiding.id).eq('status', 'available')
      if (e) throw e
      setNotice('Код списан.'); await load()
    } catch (e) {
      setError(describeError(e, 'Не удалось обновить статус кода.'))
    } finally { setBusy(false); setVoiding(null) }
  }

  return (
    <section>
      <PageHeader
        title="Склад кодов"
        description="Секретные коды видны только администраторам до выдачи. Сами коды не показываются в этом списке и не попадают в журнал действий."
        actions={<button type="button" className={btnPrimary} onClick={() => setAdding(true)} disabled={!products.length}><Plus className="size-5" aria-hidden="true" />Добавить код</button>}
      />
      {error && <Notice tone="error" onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" onClose={() => setNotice('')}>{notice}</Notice>}

      <div role="group" aria-label="Фильтр по статусу" className="mb-4 flex flex-wrap gap-2">
        {['all', 'available', 'reserved', 'delivered', 'void'].map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={`inline-flex min-h-11 items-center gap-2 border px-3.5 text-sm font-semibold ${status === s ? 'border-red bg-red text-white' : 'border-line bg-graphite hover:border-silver'}`}>
            {s === 'all' ? 'Все' : statusLabels[s]}<span className={`text-xs font-normal ${status === s ? 'text-white/80' : 'text-silver'}`}>{counts[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="relative mb-3">
        <label htmlFor="inv-q" className="sr-only">Поиск по складу</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-silver" aria-hidden="true" />
        <input id="inv-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Товар, регион, заметка" className={`${inputClass} pl-9`} />
      </div>
      {codes.length >= LIMIT && <p className="mb-3 text-xs text-silver">Показаны последние {LIMIT} кодов; счётчики считаются по ним.</p>}

      {shown.length === 0 ? (
        <EmptyState icon={KeyRound} title={codes.length === 0 ? 'Кодов пока нет' : 'Ничего не найдено'} text={codes.length === 0 ? 'Добавьте коды от поставщика кнопкой «Добавить код».' : 'Измените запрос или статус.'} />
      ) : (
        <ul className="divide-y divide-line border border-line bg-coal">
          {shown.map((c) => (
            <li key={c.id} className="grid items-center gap-x-3 gap-y-1 p-3 text-sm lg:grid-cols-[minmax(0,2fr)_8rem_10rem_minmax(0,1.5fr)_7rem]">
              <p className="min-w-0 break-words"><strong>{titleOf(c)}</strong><span className="block text-xs text-silver">{c.region || 'без региона'}</span></p>
              <div><Tag tone={statusTone[c.status as keyof typeof statusTone] ?? 'neutral'}>{statusLabels[c.status] ?? c.status}</Tag></div>
              <p className="text-silver">{new Date(c.created_at).toLocaleString('ru-RU')}</p>
              <p className="min-w-0 break-words text-silver">{c.internal_note || '—'}</p>
              <div className="lg:text-right">{c.status === 'available' && <button type="button" className="min-h-11 border border-line bg-graphite px-3 text-red-hot hover:border-silver" onClick={() => setVoiding(c)}>Списать</button>}</div>
            </li>
          ))}
        </ul>
      )}

      {adding && <AddCodeDialog busy={busy} products={products} onClose={() => setAdding(false)} onSubmit={add} />}
      {voiding && (
        <ConfirmDialog title="Списать код?" confirmLabel="Списать" danger busy={busy} onConfirm={() => void voidCode()} onCancel={() => setVoiding(null)}>
          <p>Код для «{titleOf(voiding)}» будет помечен недействительным и больше не выдастся покупателю. Отменить это действие нельзя. Выданные и зарезервированные коды здесь изменить нельзя.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

function AddCodeDialog({ busy, products, onClose, onSubmit }: { busy: boolean; products: Row[]; onClose: () => void; onSubmit: (variant: string, secret: string, note: string) => void }) {
  const [variant, setVariant] = useState(products[0] ? `${products[0].product_id}|${products[0].region}` : '')
  const [secret, setSecret] = useState(''); const [note, setNote] = useState('')
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit(variant, secret, note) }
  return (
    <Modal wide title="Добавить код от поставщика" onClose={onClose} footer={<><button type="button" className={btnSecondary} onClick={onClose}>Отмена</button><button type="submit" form="code-form" className={btnPrimary} disabled={busy}>{busy ? 'Сохраняем…' : 'Добавить код'}</button></>}>
      <form id="code-form" onSubmit={submit} className="space-y-4">
        <Field label="Вариант товара" htmlFor="code-var"><select id="code-var" required value={variant} onChange={(e) => setVariant(e.target.value)} className={inputClass}>{products.map((p) => <option key={`${p.product_id}|${p.region}`} value={`${p.product_id}|${p.region}`}>{p.title} · {p.region || 'без региона'}</option>)}</select></Field>
        <Field label="Секретный код" htmlFor="code-secret" hint="После сохранения код не отображается."><input id="code-secret" required type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className={inputClass} /></Field>
        <Field label="Служебная заметка (без секретов)" htmlFor="code-note"><textarea id="code-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} min-h-20 py-2`} /></Field>
      </form>
    </Modal>
  )
}
