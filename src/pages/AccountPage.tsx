import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { requireSupabase, supabaseConfigured } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { btnPrimary, inputClass } from '../components/common/ui'

export default function AccountPage() {
  useDocumentTitle('Личный кабинет')
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [register, setRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMessage('')
    try {
      const client = requireSupabase()
      const result = register
        ? await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}account` } })
        : await client.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (register && !result.data.session) setMessage('Проверьте почту и подтвердите адрес, затем войдите в аккаунт.')
      else navigate('/account/orders')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Не удалось выполнить вход.') }
    finally { setBusy(false) }
  }
  if (!supabaseConfigured) return <div className="container-x py-12"><h1 className="text-4xl">Личный кабинет недоступен</h1><p className="mt-3 text-silver">Supabase не настроен.</p></div>
  if (loading) return <div className="container-x py-12" role="status">Проверяем аккаунт…</div>
  if (user) return <div className="container-x py-12"><h1 className="text-4xl">Здравствуйте</h1><p className="mt-3 text-silver">{user.email}</p><Link className={`${btnPrimary} mt-6`} to="/account/orders">Мои заказы</Link><button className="ml-3 min-h-11 px-4 text-silver underline" onClick={async () => { await requireSupabase().auth.signOut(); navigate('/account') }}>Выйти</button></div>
  return <div className="container-x py-12"><form onSubmit={submit} className="mx-auto max-w-md space-y-4 border border-line bg-coal p-6"><h1 className="text-3xl">{register ? 'Создать аккаунт' : 'Вход в аккаунт'}</h1><p className="text-sm text-silver">Подтвердите email, чтобы видеть свои заказы и выданные цифровые товары.</p><label className="block text-sm">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className={inputClass}/></label><label className="block text-sm">Пароль<input required minLength={8} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e=>setPassword(e.target.value)} className={inputClass}/></label>{message && <p role="status" className="text-sm text-silver">{message}</p>}<button disabled={busy} className={btnPrimary}>{busy ? 'Подождите…' : register ? 'Зарегистрироваться' : 'Войти'}</button><button type="button" className="min-h-11 px-3 text-sm text-silver underline" onClick={()=>{setRegister(v=>!v);setMessage('')}}>{register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}</button></form></div>
}
