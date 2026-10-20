import { Link } from 'react-router-dom'
import { ArrowRight, Bot, ShieldCheck, UserCheck } from 'lucide-react'
import { btnPrimary } from '../common/ui'

export function AiPromo() {
  return (
    <section
      aria-labelledby="ai-promo-title"
      className="texture-hatch relative overflow-hidden border border-red bg-coal"
    >
      <div aria-hidden="true" className="absolute -right-10 top-0 h-full w-1/3 -skew-x-[18deg] bg-red/20" />
      <Bot aria-hidden="true" className="absolute -right-4 -top-4 size-56 text-white/5" strokeWidth={1} />
      <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <p className="mb-2 font-display text-sm uppercase tracking-[0.25em] text-red">AI-сервисы</p>
          <h2 id="ai-promo-title" className="text-3xl sm:text-5xl">
            ChatGPT, Claude и другие AI-инструменты
          </h2>
          <p className="mt-4 max-w-xl text-silver">
            Подписки и кредиты для работы, учёбы и разработки. Оформление — только на ваш собственный аккаунт и по
            официальным условиям сервисов.
          </p>
          <Link to="/category/ai" className={`${btnPrimary} mt-6`}>
            Перейти к AI
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        </div>
        <ul className="space-y-3">
          <li className="flex gap-3 border border-line bg-ink/70 p-4">
            <UserCheck className="mt-0.5 size-6 shrink-0 text-red" aria-hidden="true" />
            <span>
              <strong className="block text-white">Ваш аккаунт</strong>
              <span className="text-sm text-silver">Никакой передачи чужих логинов и паролей.</span>
            </span>
          </li>
          <li className="flex gap-3 border border-line bg-ink/70 p-4">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-red" aria-hidden="true" />
            <span>
              <strong className="block text-white">Честные условия</strong>
              <span className="text-sm text-silver">Способ получения и ограничения указаны на странице товара.</span>
            </span>
          </li>
        </ul>
      </div>
    </section>
  )
}
