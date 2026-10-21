import { useEffect, useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, TriangleAlert } from 'lucide-react'
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
      setError(data === true ? '' : 'Вход выполнен, но функция is_admin() не подтвердила членство в admin_users. Проверьте UUID аккаунта и SQL-функцию.')
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

  return <div className="container-x py-8 sm:py-12"><div className="mb-4 flex justify-end"><button type="button" onClick={signOut} className="inline-flex min-h-11 items-center gap-2 text-sm text-silver"><LogOut size={16}/>Выйти</button></div><nav aria-label="Разделы админ-панели" className="mb-5 flex flex-wrap gap-2 border-b border-line pb-3 text-sm">{[['/admin/orders','Заказы'],['/admin/catalog','Каталог'],['/admin/suppliers','Поставщики'],['/admin/inventory','Коды']].map(([to,label])=><NavLink key={to} to={to} className={({isActive})=>`inline-flex min-h-11 items-center border-b-2 px-3 py-2 transition-colors ${isActive?'border-red bg-graphite font-semibold text-white':'border-transparent text-silver hover:bg-steel hover:text-white'}`}>{label}</NavLink>)}</nav><div role="note" className="mb-8 flex gap-3 border border-red bg-red/10 p-4 text-sm"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-red-hot" aria-hidden="true"/><div><p className="font-semibold text-white">Администрирование BezB</p><p className="text-silver">Доступ ограничен членами admin_users. Оплата подтверждается вручную. Не записывайте коды и пароли в заметки.</p></div></div><Outlet/></div>
}
