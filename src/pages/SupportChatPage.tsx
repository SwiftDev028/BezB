import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Copy } from 'lucide-react'
import { SupportConversation } from '../components/support/SupportConversation'
import { btnSecondary } from '../components/common/ui'
import { supportRepository } from '../services/support'
import type { SupportThread } from '../types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function SupportChatPage() {
  const { orderId = '' } = useParams()
  const { hash } = useLocation()
  const guestToken = new URLSearchParams(hash.slice(1)).get('token') ?? undefined
  const [thread, setThread] = useState<SupportThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')
  useDocumentTitle(thread ? `Поддержка · ${thread.orderNumber}` : 'Поддержка по заказу')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setThread(null)
    void supportRepository.getCustomerThread(orderId, guestToken).then(async (result) => {
      if (!active) return
      if (!result.ok) setError(result.error)
      else {
        setThread(result.value)
        const marked = await supportRepository.markCustomerRead(orderId, guestToken)
        if (!marked.ok && active) setError(marked.error)
      }
      setLoading(false)
    }).catch((loadError: unknown) => {
      if (!active) return
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить переписку.')
      setLoading(false)
    })
    return () => { active = false }
  }, [orderId, guestToken])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopyMessage('Ссылка скопирована. Сохраните её, чтобы открыть чат на другом устройстве.')
    } catch (copyError) {
      setCopyMessage(copyError instanceof Error ? `Не удалось скопировать ссылку: ${copyError.message}` : 'Не удалось скопировать ссылку.')
    }
  }

  if (loading) return <div className="container-x py-12" role="status">Загружаем переписку…</div>

  return (
    <div className="container-x py-8 sm:py-12">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to="/support" className={`${btnSecondary} w-fit`}>Мои обращения</Link>
        {!thread ? (
          <div className="space-y-4 border border-red bg-red/10 p-4">
            <h1 className="text-3xl">Чат недоступен</h1>
            <p role="alert" className="text-sm text-silver">{error || 'Обращение не найдено.'}</p>
            <Link to="/support" className="text-sm text-white underline">Мои обращения</Link>
          </div>
        ) : (
          <>
            {error && <p role="alert" className="border border-red p-3 text-sm text-red-hot">{error}</p>}
            <header className="space-y-2">
              <p className="font-display text-sm uppercase tracking-[0.2em] text-red">Поддержка BezB</p>
              <h1 className="text-3xl sm:text-5xl">Заказ {thread.orderNumber}</h1>
              <p className="text-sm text-silver">Чат доступен независимо от статуса оплаты. Переписка привязана к этому заказу.</p>
            </header>
            {guestToken && (
              <div className="border-l-4 border-red bg-coal p-3 text-xs leading-relaxed text-silver">
                Ссылка содержит секрет доступа. Не пересылайте её посторонним.
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btnSecondary} onClick={() => void copyLink()}>
                <Copy className="size-4" aria-hidden="true" />Скопировать защищённую ссылку
              </button>
              {copyMessage && <p role="status" className="self-center text-xs text-silver">{copyMessage}</p>}
            </div>
            <SupportConversation thread={thread} author="customer" guestToken={guestToken} onChange={setThread} />
            <div className="flex flex-wrap gap-3">
              <Link to="/support" className={btnSecondary}>Мои обращения</Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
