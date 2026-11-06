import { Link } from 'react-router-dom'
import { Logo } from '../common/Logo'
import { infoNav, legalNav, mainNav } from '../navigation/navItems'

const footerInfoNav = [
  ...infoNav.filter((item) => item.to !== '/contacts'),
  { to: '/account', label: 'Личный кабинет' },
]
const footerLegalNav = legalNav.filter((item) => item.to !== '/admin/orders')

function LinkColumn({ title, items }: { title: string; items: { to: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h2 className="mb-3 text-base text-white">{title}</h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.to}>
            <Link to={item.to} className="inline-flex min-h-11 items-center text-sm sm:min-h-9 text-silver hover:text-white">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Footer() {
  return (
    <footer className="texture-hatch mt-16 border-t-4 border-red bg-coal">
      <div className="container-x grid gap-10 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo size="lg" />
          <p className="mt-3 font-display text-lg uppercase tracking-wide text-silver">Digital. Without Limits.</p>
        </div>
        <LinkColumn title="Каталог" items={mainNav} />
        <LinkColumn title="Покупателям" items={footerInfoNav} />
        <LinkColumn title="Правовая информация" items={footerLegalNav} />
      </div>
      <div className="border-t border-line">
        <div className="container-x space-y-3 py-5 text-xs leading-relaxed text-silver">
          <p>
            BezB — независимый магазин цифровых товаров и не является официальным представителем или партнёром платформ и
            правообладателей, упомянутых в каталоге.
          </p>
          <p>
            Онлайн-оплата на сайте пока не подключена. Оформление заказа не означает списание денег или подтверждение
            исполнения заказа. Условия получения зависят от конкретного товара и указаны в его карточке.
          </p>
          <p>© 2026 BezB. Все права защищены.</p>
        </div>
      </div>
    </footer>
  )
}
