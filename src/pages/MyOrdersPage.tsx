import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { requireSupabase, supabaseConfigured } from '../services/supabase'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { formatPrice } from '../utils/format'
import { formatDateTime } from '../utils/formatDate'
import type { Currency } from '../types'
import { subscriptionTerm } from '../utils/catalog'

type BuyerOrder = { id: string; order_number: string; created_at: string; status: string; payment_status: string; total_amount: number; order_items: { product_name: string; platform: string; region: string | null; denomination:number|null; denomination_currency:string|null; subscription_months:number|null; subscription_bonus_months:number; quantity: number; unit_price: number }[] }
type DeliveredCode = { order_id: string; order_number: string; product_name: string; region: string | null; code: string; activation_instructions: string | null }
export default function MyOrdersPage() {
  useDocumentTitle('Мои заказы')
  const { user, loading: authLoading } = useAuth()
  const [orders, setOrders] = useState<BuyerOrder[]>([])
  const [codes, setCodes] = useState<DeliveredCode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [claimMessage, setClaimMessage] = useState('')
  const [claimBusy, setClaimBusy] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    if (authLoading) return
    if (!user || !supabaseConfigured) { setLoading(false); return }
    let active = true
    const client = requireSupabase()
    Promise.all([
      client.from('orders').select('id,order_number,created_at,status,payment_status,total_amount,order_items(product_name,platform,region,denomination,denomination_currency,subscription_months,subscription_bonus_months,quantity,unit_price)').order('created_at', { ascending: false }),
      client.rpc('my_delivered_codes'),
    ]).then(([orderResult, codeResult]) => {
      if (!active) return
      if (orderResult.error) throw orderResult.error
      if (codeResult.error) throw codeResult.error
      setOrders(orderResult.data ?? [])
      setCodes(codeResult.data ?? [])
    }).catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить ваши заказы.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user, authLoading, refreshKey])
  const claimGuestOrders = async () => {
    setClaimBusy(true)
    setClaimMessage('')
    setError('')
    try {
      const { data, error: rpcError } = await requireSupabase().rpc('claim_guest_orders')
      if (rpcError) throw rpcError
      const count = typeof data === 'number' ? data : 0
      setClaimMessage(count > 0 ? `К аккаунту привязано заказов: ${count}.` : 'Новых гостевых заказов для этого подтверждённого email нет.')
      setRefreshKey((key) => key + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось найти гостевые заказы.')
    } finally {
      setClaimBusy(false)
    }
  }
  if (authLoading || loading) return <div className="container-x py-12" role="status">Загружаем заказы…</div>
  if (!user) return <div className="container-x py-12"><h1 className="text-4xl">Войдите, чтобы посмотреть заказы</h1><Link to="/account" className="mt-4 inline-block underline">Войти или создать аккаунт</Link></div>
  return <div className="container-x py-8 sm:py-12"><h1 className="mb-6 text-4xl">Мои заказы</h1>
    {user.email_confirmed_at && <section className="mb-6 border border-line bg-coal p-4"><p className="text-sm text-silver">Искать гостевые заказы, оформленные с подтверждённым адресом этого аккаунта.</p><button type="button" disabled={claimBusy} onClick={() => void claimGuestOrders()} className="mt-3 min-h-11 border border-line px-4 text-sm font-semibold hover:border-silver disabled:opacity-50">{claimBusy ? 'Проверяем…' : 'Найти мои гостевые заказы'}</button>{claimMessage && <p role="status" className="mt-3 text-sm text-silver">{claimMessage}</p>}</section>}
    {error && <p role="alert" className="mb-4 border border-red p-4">{error}</p>}{orders.length===0 ? <p className="text-silver">Заказов пока нет.</p> : <ul className="space-y-4">{orders.map(order => <li key={order.id} className="border border-line bg-coal p-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="text-2xl">Заказ {order.order_number}</h2><span className="text-sm text-silver">{formatDateTime(order.created_at)}</span></div><p className="mt-2 text-sm">Оплата: {order.payment_status === 'paid' ? 'Подтверждена' : order.payment_status === 'refunded' ? 'Возвращена' : 'Ожидает ручного подтверждения'} · Статус: {order.status}</p><p className="mt-1 font-semibold">{formatPrice(Number(order.total_amount), 'RUB' as Currency)}</p><ul className="mt-3 divide-y divide-line">{order.order_items.map((item,i)=><li key={`${item.product_name}-${i}`} className="py-2 text-sm text-silver">{item.product_name}{item.region ? ` · ${item.region}` : ''}{subscriptionTerm({ subscriptionMonths: item.subscription_months, subscriptionBonusMonths: item.subscription_bonus_months }) ? ` · ${subscriptionTerm({ subscriptionMonths: item.subscription_months, subscriptionBonusMonths: item.subscription_bonus_months })}` : ''}{item.denomination ? ` · ${item.denomination} ${item.denomination_currency??''}` : ''} · {item.quantity} × {formatPrice(Number(item.unit_price),'RUB' as Currency)}</li>)}</ul>{codes.filter(c=>c.order_id===order.id).map((item,i)=><div key={`${item.order_id}-${i}`} className="mt-3 border border-line p-3"><p className="font-semibold">{item.product_name}{item.region ? ` · ${item.region}` : ''}</p><code className="mt-2 block select-all break-all rounded bg-ink p-3">{item.code}</code><div className="mt-2 flex gap-3"><button className="underline" onClick={async()=>{await navigator.clipboard.writeText(item.code);setCopied(item.code)}}>Скопировать код</button>{copied===item.code && <span role="status">Скопировано</span>}</div>{item.activation_instructions && <p className="mt-3 whitespace-pre-wrap text-sm text-silver">{item.activation_instructions}</p>}</div>)}</li>)}</ul>}</div>
}
