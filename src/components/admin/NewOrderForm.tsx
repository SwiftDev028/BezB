import { useId, useState, type FormEvent } from 'react'
import { products } from '../../data/products'
import { useOrders } from '../../context/OrdersContext'
import { btnPrimary, inputClass } from '../common/ui'
import { validateCheckout } from '../../utils/checkout'
import { formatPrice } from '../../utils/format'

/** Ручное создание демо-заказа — нужно, чтобы проверить админку, пока на сайте нет реальных заказов. */
export function NewOrderForm({ onCreated }: { onCreated: (id: string) => void }) {
  const { create } = useOrders()
  const uid = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [productId, setProductId] = useState(products.find((p) => p.available)?.id ?? products[0].id)
  const [quantity, setQuantity] = useState(1)
  const [region, setRegion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const product = products.find((p) => p.id === productId)!

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = validateCheckout(name, email, true)
    if (v.name || v.email) {
      setError(v.name ?? v.email ?? null)
      return
    }
    setBusy(true)
    const result = await create({
      customer: { name, email },
      lines: [{ productId, quantity, region: product.regions ? region || product.regions[0] : undefined }],
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    setName('')
    setEmail('')
    onCreated(result.value.id)
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 border border-line bg-coal p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <label htmlFor={`${uid}-name`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Покупатель</label>
        <input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoComplete="off" />
      </div>
      <div>
        <label htmlFor={`${uid}-email`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Email</label>
        <input id={`${uid}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} autoComplete="off" placeholder="demo@example.com" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-product`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Товар</label>
        <select id={`${uid}-product`} value={productId} onChange={(e) => { setProductId(e.target.value); setRegion('') }} className={inputClass}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.title} — {formatPrice(p.price, p.currency)}</option>
          ))}
        </select>
      </div>
      {product.regions && (
        <div>
          <label htmlFor={`${uid}-region`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Регион</label>
          <select id={`${uid}-region`} value={region || product.regions[0]} onChange={(e) => setRegion(e.target.value)} className={inputClass}>
            {product.regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={`${uid}-qty`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-silver">Количество</label>
        <input id={`${uid}-qty`} type="number" min={1} max={10} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={inputClass} />
      </div>
      <div className="flex items-end">
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>Создать демо-заказ</button>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-red-hot sm:col-span-2 lg:col-span-4">{error}</p>}
    </form>
  )
}
