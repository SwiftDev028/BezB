import { Link } from 'react-router-dom'
import { Logo } from '../common/Logo'
import { infoNav, legalNav, mainNav } from '../navigation/navItems'

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
        <LinkColumn title="Информация" items={infoNav} />
        <LinkColumn title="Документы" items={legalNav} />
      </div>
      <div className="border-t border-line">
        <div className="container-x space-y-2 py-5 text-xs leading-relaxed text-silver">
          <p>
            BezB — независимый проект и не является официальным магазином Apple, Xbox, PlayStation, Steam, OpenAI или
            Anthropic. Все названия и товарные знаки принадлежат их владельцам и используются только для указания
            совместимости.
          </p>
          <p>Онлайн-оплата не подключена. Оплата и выдача подтверждаются администратором вручную.</p>
          <p>© {new Date().getFullYear()} BezB</p>
        </div>
      </div>
    </footer>
  )
}
