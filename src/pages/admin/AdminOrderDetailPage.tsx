import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Info, SearchX } from 'lucide-react'
import { FulfillmentBadge, PaymentBadge } from '../../components/admin/StatusBadge'
import { OrderHistory } from '../../components/admin/OrderHistory'
import { EmptyState } from '../../components/common/EmptyState'
import { btnPrimary, btnSecondary, inputClass } from '../../components/common/ui'
import { useOrders } from '../../context/OrdersContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatDateTime } from '../../utils/formatDate'
import { formatPrice } from '../../utils/format'
import { requireSupabase } from '../../services/supabase'
import { useCatalog } from '../../context/CatalogContext'
import {
  MAX_TEXT,
  addComment,
  setDeliveryInfo,
} from '../../utils/orders'

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams()
  const { orders, loading, update, refresh } = useOrders()
  const { getProduct } = useCatalog()
  const [availableCodes,setAvailableCodes]=useState<Record<string,any>[]>([])
  const [assignedCodes,setAssignedCodes]=useState<Record<string,any>[]>([])
  const [audit,setAudit]=useState<Record<string,any>[]>([])
  const [selectedCodes,setSelectedCodes]=useState<Record<string,string>>({})
  const [actionError,setActionError]=useState('');const [actionMessage,setActionMessage]=useState('');const [actionBusy,setActionBusy]=useState(false);const [copiedCode,setCopiedCode]=useState('')
  const order = orders.find((o) => o.id === id)
  useDocumentTitle(order ? `Заказ ${order.number}` : 'Заказ')

  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [delivery, setDelivery] = useState('')
  const [deliveryError, setDeliveryError] = useState<string | null>(null)
  const [deliverySaved, setDeliverySaved] = useState(false)

  const loadFulfillment = useCallback(async () => {
    const db=requireSupabase()
    const [available,assigned,events]=await Promise.all([
      db.from('digital_codes').select('id,product_id,region,status').eq('status','available').order('created_at'),
      db.from('digital_codes').select('id,product_id,region,status,secret_code,assigned_order_item_id,delivered_at').eq('assigned_order_id',id).in('status',['reserved','delivered']),
      db.from('order_audit_events').select('id,event_type,actor_id,details,created_at').eq('order_id',id).order('created_at'),
    ])
    for(const result of [available,assigned,events])if(result.error)throw result.error
    setAvailableCodes(available.data??[]);setAssignedCodes(assigned.data??[]);setAudit(events.data??[])
  },[id])
  useEffect(()=>{void loadFulfillment().catch(e=>setActionError(e instanceof Error?e.message:'Не удалось загрузить выдачу.'))},[loadFulfillment])
  const auditEvents=useMemo(()=>audit.map((e)=>({id:e.id,type:'comment' as const,at:e.created_at,actor:e.actor_id?`Администратор · ${String(e.actor_id).slice(0,8)}`:'Система',text:({payment_confirmed:'Оплата подтверждена вручную',processing_started:'Начата обработка',order_cancelled:'Заказ отменён',code_assigned:'Цифровой код назначен',digital_goods_delivered:'Коды выданы в личный кабинет',delivery_email_marked_sent:'Ручная отправка email отмечена',order_created:'Заказ создан'} as Record<string,string>)[e.event_type]??'Действие администратора'})),[audit])

  // Поле выдачи подхватывает сохранённое значение при открытии заказа
  const savedDelivery = order?.delivery.note ?? ''
  useEffect(() => {
    setDelivery(savedDelivery)
  }, [order?.id, savedDelivery])

  if (loading) return <p role="status" className="text-silver">Загрузка…</p>
  if (!order)
    return (
      <EmptyState icon={SearchX} title="Заказ не найден" text="Заказ отсутствует или недоступен.">
        <Link to="/admin/orders" className={btnSecondary}>К списку заказов</Link>
      </EmptyState>
    )

  const submitComment = async (e: FormEvent) => {
    e.preventDefault()
    const r = await update(order.id, (o, now) => addComment(o, comment, now))
    if (r.ok) {
      setComment('')
      setCommentError(null)
    } else setCommentError(r.error)
  }

  const submitDelivery = async (e: FormEvent) => {
    e.preventDefault()
    const r = await update(order.id, (o, now) => setDeliveryInfo(o, delivery, now))
    setDeliveryError(r.ok ? null : r.error)
    setDeliverySaved(r.ok)
  }

  const runAdminAction=async(name:string,args:Record<string,unknown>={})=>{setActionBusy(true);setActionError('');setActionMessage('');try{const {error}=await requireSupabase().rpc(name,args);if(error)throw error;await Promise.all([refresh(),loadFulfillment()]);setActionMessage('Изменение сохранено.')}catch(e){setActionError(e instanceof Error?e.message:'Не удалось выполнить действие.')}finally{setActionBusy(false)}}
  const canDeliver=order ? order.items.every(item=>assignedCodes.filter(c=>c.assigned_order_item_id===item.id&&c.status==='reserved').length===item.quantity) : false
  const emailBody=order?`Здравствуйте, ${order.customer.name}!\n\nЗаказ ${order.number}:\n\n${order.items.map(item=>{const itemCodes=assignedCodes.filter(c=>c.assigned_order_item_id===item.id);const instructions=getProduct(item.productId)?.activationInstructions??'';return `${item.title}${item.region?` · ${item.region}`:''}${item.denomination?` · ${item.denomination} ${item.denominationCurrency??''}`:''}\nКод(ы):\n${itemCodes.map(c=>c.secret_code).join('\n')}${instructions?`\n\nИнструкция:\n${instructions}`:''}`}).join('\n\n')}\n\nКоды также доступны в личном кабинете BezB.`:''

  return (
    <>
      <Link to="/admin/orders" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-silver hover:text-white">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Все заказы
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-4xl sm:text-5xl">Заказ {order.number}</h1>
        <PaymentBadge status={order.paymentStatus} />
        <FulfillmentBadge status={order.fulfillmentStatus} />
      </div>
      <p className="-mt-3 mb-6 text-sm text-silver">
        Создан {formatDateTime(order.createdAt)} · обновлён {formatDateTime(order.updatedAt)} · версия {order.version}
        {order.isDemo && ' · демонстрационный заказ'}
        {order.source === 'checkout' && ' · оформлен покупателем на сайте'}
        {order.source === 'admin' && ' · создан вручную в админке'}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <section aria-labelledby="items" className="border border-line bg-coal">
            <h2 id="items" className="border-b border-line p-4 text-2xl">Состав заказа</h2>
            <ul className="divide-y divide-line">
              {order.items.map((i) => (
                <li key={`${i.productId}-${i.region ?? ''}`} className="flex justify-between gap-3 p-4 text-sm">
                  <span className="min-w-0">
                    <Link to={`/product/${i.productId}`} className="font-semibold text-white hover:text-red-hot">{i.title}</Link>
                    <span className="block text-xs text-silver">
                      {i.platform}{i.region ? ` · регион: ${i.region}` : ''}{i.denomination ? ` · номинал: ${i.denomination} ${i.denominationCurrency??''}` : ''} · {i.quantity} × {formatPrice(i.unitPrice, order.currency)}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatPrice(i.unitPrice * i.quantity, order.currency)}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-baseline justify-between border-t border-line p-4">
              <span className="text-silver">Итого</span>
              <span className="font-display text-3xl font-bold">{formatPrice(order.total, order.currency)}</span>
            </p>
          </section>

          <section aria-labelledby="customer" className="border border-line bg-coal p-4">
            <h2 id="customer" className="mb-3 text-2xl">Покупатель</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs uppercase tracking-wider text-silver">Имя</dt><dd className="mt-0.5">{order.customer.name}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-silver">Email</dt><dd className="mt-0.5 break-all">{order.customer.email}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-silver">Телефон</dt><dd className="mt-0.5">{order.customer.phone || '—'}</dd></div>
              <div><dt className="text-xs uppercase tracking-wider text-silver">Доставка / получение</dt><dd className="mt-0.5">{order.customer.address || '—'}</dd></div>
              {order.customer.comment && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-silver">Комментарий покупателя</dt><dd className="mt-0.5 whitespace-pre-wrap">{order.customer.comment}</dd></div>}
              {order.consentAt && <div className="sm:col-span-2 text-xs text-silver">Согласие подтверждено: {formatDateTime(order.consentAt)}</div>}
            </dl>
          </section>

          <section aria-labelledby="delivery" className="border border-line bg-coal p-4">
            <h2 id="delivery" className="mb-3 text-2xl">Выдача цифрового товара</h2>
            <p className="mb-3 flex gap-2 border-l-4 border-red bg-ink p-3 text-sm text-silver">
              <Info className="mt-0.5 size-4 shrink-0 text-red" aria-hidden="true" />
              Фиксируйте только факт и способ выдачи (когда, куда, кто подтвердил). Не записывайте коды, ключи и пароли в это поле.
            </p>
            <form onSubmit={submitDelivery} className="space-y-3">
              <label htmlFor="delivery-note" className="block text-xs font-semibold uppercase tracking-wider text-silver">Информация о выдаче</label>
              <textarea
                id="delivery-note"
                rows={4}
                maxLength={MAX_TEXT}
                value={delivery}
                disabled={order.fulfillmentStatus === 'cancelled'}
                onChange={(e) => { setDelivery(e.target.value); setDeliverySaved(false) }}
                className={`${inputClass} py-2`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={order.fulfillmentStatus === 'cancelled'} className={btnPrimary}>Сохранить</button>
                {order.delivery.updatedAt && <span className="text-xs text-silver">Обновлено {formatDateTime(order.delivery.updatedAt)}</span>}
                {deliverySaved && <span role="status" className="text-sm text-white">Сохранено</span>}
              </div>
              {deliveryError && <p role="alert" className="text-sm font-medium text-red-hot">{deliveryError}</p>}
            </form>
          </section>

          <section aria-labelledby="history" className="border border-line bg-coal p-4 sm:p-6">
            <h2 id="history" className="mb-5 text-2xl">История изменений</h2>
            <OrderHistory events={[...order.history,...auditEvents]} />
          </section>
        </div>

        <div className="space-y-6">
          <section aria-labelledby="statuses" className="space-y-4 border border-line bg-coal p-4">
            <h2 id="statuses" className="text-2xl">Статусы</h2>
            <p className="text-xs text-silver">Оплату проверяют вне сайта. Подтверждение вручную разблокирует обработку, но не запускает автоматическую закупку.</p>
            {order.paymentStatus!=='paid'&&order.fulfillmentStatus!=='cancelled'&&<button disabled={actionBusy} onClick={()=>void runAdminAction('admin_confirm_payment',{p_order_id:order.id})} className={btnPrimary}>Подтвердить оплату</button>}
            {order.paymentStatus==='paid'&&order.fulfillmentStatus!=='delivered'&&order.fulfillmentStatus!=='cancelled'&&<button disabled={actionBusy} onClick={()=>void runAdminAction('admin_start_processing',{p_order_id:order.id})} className={btnSecondary}>Начать обработку</button>}
            {order.fulfillmentStatus!=='delivered'&&order.fulfillmentStatus!=='cancelled'&&<button disabled={actionBusy} onClick={()=>void runAdminAction('admin_cancel_order',{p_order_id:order.id})} className="min-h-11 border border-red px-4 text-red-hot">Отменить заказ</button>}
            {actionError&&<p role="alert" className="text-sm text-red-hot">{actionError}</p>}{actionMessage&&<p role="status" className="text-sm text-silver">{actionMessage}</p>}
          </section>

          <section className="space-y-4 border border-line bg-coal p-4"><h2 className="text-2xl">Коды и ручная выдача</h2>{order.paymentStatus!=='paid'&&<p className="text-sm text-silver">Сначала подтвердите оплату. Коды нельзя назначить неоплаченному заказу.</p>}
            {order.items.map((item,index)=>{const itemId=item.id??'';const candidates=availableCodes.filter(c=>c.product_id===item.productId&&String(c.region??'')===String(item.region??''));const count=assignedCodes.filter(c=>c.assigned_order_item_id===itemId&&c.status==='reserved').length;return <div key={itemId||index} className="border-t border-line pt-3"><p className="font-semibold">{item.title} · {item.region||'без региона'} · {count}/{item.quantity} кодов</p>{order.paymentStatus==='paid'&&order.fulfillmentStatus!=='delivered'&&count<item.quantity&&<div className="mt-2 flex gap-2"><select aria-label={`Код для ${item.title}`} value={selectedCodes[itemId]??''} onChange={e=>setSelectedCodes(s=>({...s,[itemId]:e.target.value}))} className={inputClass}><option value="">Доступные коды: {candidates.length}</option>{candidates.map(c=><option key={c.id} value={c.id}>{String(c.id).slice(0,8)} · {c.region||'общий'}</option>)}</select><button disabled={actionBusy||!selectedCodes[itemId]||!itemId} onClick={async()=>{await runAdminAction('admin_assign_code',{p_order_id:order.id,p_order_item_id:itemId,p_code_id:selectedCodes[itemId]});setSelectedCodes(s=>({...s,[itemId]:''}))}} className={btnSecondary}>Назначить</button></div>}</div>})}
            {order.paymentStatus==='paid'&&order.fulfillmentStatus!=='delivered'&&<button disabled={actionBusy||!canDeliver} onClick={()=>void runAdminAction('admin_deliver_order',{p_order_id:order.id})} className={btnPrimary}>Подтвердить выдачу в личный кабинет</button>}
            {assignedCodes.map(c=><div key={c.id} className="border-t border-line pt-3"><p className="text-sm text-silver">{c.product_id} · {c.region||'без региона'} · {c.status}</p><code className="mt-2 block select-all break-all rounded bg-ink p-3">{c.secret_code}</code><button className="mt-2 min-h-10 underline" onClick={async()=>{await navigator.clipboard.writeText(c.secret_code);setCopiedCode(c.id)}}>Скопировать код</button>{copiedCode===c.id&&<span role="status" className="ml-2 text-sm">Скопировано</span>}</div>)}
            {order.fulfillmentStatus==='delivered'&&<div className="space-y-2 border-t border-line pt-3"><p className="text-sm">Коды выданы в личный кабинет. Письмо автоматически не отправляется.</p><button className="min-h-10 underline" onClick={async()=>{await navigator.clipboard.writeText(order.customer.email)}}>Скопировать email</button><a className="ml-3 underline" href={`mailto:${encodeURIComponent(order.customer.email)}?subject=${encodeURIComponent(`BezB — заказ ${order.number}`)}&body=${encodeURIComponent(emailBody)}`}>Открыть почту с шаблоном и кодами</a><button className="ml-3 min-h-10 underline" disabled={actionBusy} onClick={()=>void runAdminAction('admin_mark_delivery_email_sent',{p_order_id:order.id})}>Отметить email отправленным вручную</button>{order.deliveryEmailSentAt&&<p className="text-xs text-silver">Отправка отмечена {formatDateTime(order.deliveryEmailSentAt)}</p>}</div>}
          </section>

          <section aria-labelledby="comments" className="border border-line bg-coal p-4">
            <h2 id="comments" className="mb-3 text-2xl">Добавить комментарий</h2>
            <form onSubmit={submitComment} className="space-y-3">
              <label htmlFor="comment-text" className="sr-only">Комментарий</label>
              <textarea
                id="comment-text"
                rows={3}
                maxLength={MAX_TEXT}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                aria-invalid={Boolean(commentError)}
                aria-describedby={commentError ? 'comment-error' : undefined}
                className={`${inputClass} py-2`}
                placeholder="Заметка для команды"
              />
              {commentError && <p id="comment-error" role="alert" className="text-sm font-medium text-red-hot">{commentError}</p>}
              <button type="submit" className={`${btnPrimary} w-full`}>Добавить</button>
            </form>
          </section>
        </div>
      </div>
    </>
  )
}
