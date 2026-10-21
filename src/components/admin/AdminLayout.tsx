import { useEffect, useState, type FormEvent } from 'react'
import { Outlet } from 'react-router-dom'
import { LogOut, TriangleAlert } from 'lucide-react'
import { OrdersProvider } from '../../context/OrdersContext'
import { requireSupabase, supabaseConfigured } from '../../services/supabase'
import { btnPrimary, inputClass } from '../common/ui'

export default function AdminLayout() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const verify = async () => {
    try {
      const db = requireSupabase()
      const { data: { user } } = await db.auth.getUser()
      if (!user) { setAllowed(false); return }
      const { data, error: membershipError } = await db.rpc('is_admin')
      if (membershipError) throw membershipError
      setAllowed(data === true)
    } catch (e) {
      setAllowed(false)
      setError(e instanceof Error ? e.message : 'Не удалось проверить доступ.')
    } finally { setLoading(false) }
  }

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex, nofollow'; document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return }
    void verify()
    const { data: { subscription } } = requireSupabase().auth.onAuthStateChange(() => { void verify() })
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { error: authError } = await requireSupabase().auth.signInWithPassword({ email, password })
      if (authError) throw authError
      await verify()
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти.'); setLoading(false) }
  }
  const signOut = async () => { await requireSupabase().auth.signOut(); setAllowed(false) }

  if (!supabaseConfigured) return <div className="container-x py-12"><h1 className="text-4xl">Админ-панель не настроена</h1><p className="mt-4 text-silver">Добавьте публичные VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY при сборке и примените SQL-миграцию.</p></div>
  if (loading) return <div className="container-x py-12" role="status">Проверяем доступ…</div>
  if (!allowed) return <div className="container-x py-12"><form onSubmit={signIn} className="mx-auto max-w-md space-y-4 border border-line bg-coal p-6"><h1 className="text-3xl">Вход администратора</h1><p className="text-sm text-silver">Доступ проверяется сессией Supabase Auth и функцией, проверяющей admin_users.</p><label className="block text-sm">Email<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className={inputClass}/></label><label className="block text-sm">Пароль<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass}/></label>{error && <p role="alert" className="text-red-hot">{error}</p>}<button className={btnPrimary} disabled={loading}>Войти</button></form></div>

  return <OrdersProvider><div className="container-x py-8 sm:py-12"><div className="mb-4 flex justify-end"><button type="button" onClick={signOut} className="inline-flex min-h-11 items-center gap-2 text-sm text-silver"><LogOut size={16}/>Выйти</button></div><div role="note" className="mb-8 flex gap-3 border border-red bg-red/10 p-4 text-sm"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-hot" aria-hidden="true"/><div><p className="font-semibold text-white">Администрирование заказов</p><p className="text-silver">Доступ ограничен членами admin_users. Оплата не подключена. Не записывайте коды и пароли в заметки заказа.</p></div></div><Outlet/></div></OrdersProvider>
}
