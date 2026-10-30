import { useEffect, useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ClipboardList, KeyRound, LogOut, MessageSquare, Package, Truck, type LucideIcon } from 'lucide-react'
import { requireSupabase, supabaseConfigured } from '../../services/supabase'
import { btnPrimary, inputClass } from '../common/ui'

export default function AdminLayout() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [allowed, setAllowed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adminEmail, setAdminEmail] = useState('')

  const verify = async () => {
    try {
      const db = requireSupabase()
      const { data: { user } } = await db.auth.getUser()
      if (!user) { setAllowed(false); return }
      setAdminEmail(user.email ?? '')
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
  if (!allowed) {
    return (
      <div className="container-x py-12">
        <form onSubmit={signIn} className="mx-auto max-w-md space-y-4 border border-line bg-coal p-5 sm:p-6">
          <h1 className="text-3xl">Вход администратора</h1>
          <p className="text-sm text-silver">Доступ проверяется сессией Supabase Auth и функцией, проверяющей admin_users.</p>
          <label className="block text-sm">Email<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className={inputClass}/></label>
          <label className="block text-sm">Пароль<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass}/></label>
          {error && <p role="alert" className="break-words text-red-hot">{error}</p>}
          <button className={btnPrimary} disabled={loading}>Войти</button>
        </form>
      </div>
    )
  }

  return (
    <div className="container-x py-6 sm:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="font-display text-sm uppercase tracking-[0.2em] text-red">Админ-панель BezB</p>
          <p className="truncate text-xs text-silver">{adminEmail}</p>
        </div>
        <button type="button" onClick={signOut} className="inline-flex min-h-11 items-center gap-2 border border-line px-4 text-sm text-silver hover:border-silver hover:text-white">
          <LogOut size={16} aria-hidden="true" />Выйти
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Разделы админ-панели" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0">
            {navGroups.map((group) => (
              <li key={group.title} className="shrink-0 lg:shrink">
                <p className="mb-1 hidden px-3 text-xs font-semibold uppercase tracking-wider text-silver/70 lg:block">{group.title}</p>
                <ul className="flex gap-1 lg:flex-col">
                  {group.items.map(({ to, label, Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        className={({ isActive }) =>
                          `flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm lg:border-b-0 lg:border-l-2 ${
                            isActive ? 'border-red bg-graphite font-semibold text-white' : 'border-transparent text-silver hover:bg-graphite hover:text-white'
                          }`
                        }
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
        <div id="admin-content" className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

const navGroups: { title: string; items: { to: string; label: string; Icon: LucideIcon }[] }[] = [
  { title: 'Продажи', items: [{ to: '/admin/orders', label: 'Заказы', Icon: ClipboardList }, { to: '/admin/support', label: 'Поддержка', Icon: MessageSquare }] },
  {
    title: 'Каталог',
    items: [
      { to: '/admin/catalog', label: 'Товары', Icon: Package },
      { to: '/admin/inventory', label: 'Склад кодов', Icon: KeyRound },
    ],
  },
  { title: 'Закупки', items: [{ to: '/admin/suppliers', label: 'Поставщики', Icon: Truck }] },
]
