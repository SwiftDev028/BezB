import { FileText, Scale, Smartphone, UserCheck } from 'lucide-react'

const benefits = [
  {
    icon: FileText,
    title: 'Понятные карточки товаров',
    text: 'Платформа, регион, способ получения и ограничения — на одной странице.',
  },
  {
    icon: Scale,
    title: 'Только законные источники',
    text: 'Продажи будут запущены только с подтверждёнными поставщиками.',
  },
  {
    icon: UserCheck,
    title: 'Ваш аккаунт — только ваш',
    text: 'Подписки оформляются без передачи чужих аккаунтов.',
  },
  {
    icon: Smartphone,
    title: 'Удобно с телефона',
    text: 'Каталог, избранное и корзина работают на любом экране.',
  },
]

export function Benefits() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {benefits.map(({ icon: Icon, title, text }) => (
        <li key={title} className="border border-line bg-coal p-5">
          <Icon className="mb-3 size-8 text-red" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-lg">{title}</h3>
          <p className="mt-2 text-sm text-silver">{text}</p>
        </li>
      ))}
    </ul>
  )
}
