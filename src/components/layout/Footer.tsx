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
        <div className="container-x space-y-3 py-5 text-xs leading-relaxed text-silver">
          <p>
            Все изображения, логотипы, названия игр, программ и других продуктов, размещённые на сайте BezB, используются
            в информационных целях. Все товарные знаки, логотипы и иные объекты интеллектуальной собственности принадлежат
            их законным правообладателям. Их упоминание и использование на сайте не означает, что BezB является
            официальным представителем, партнёром или аффилированным лицом соответствующих правообладателей.
          </p>
          <p>
            BezB — независимый магазин цифровых товаров.
            <br />
            Онлайн-оплата пока не подключена. Обработка заказов и подтверждение оплаты осуществляются администратором
            вручную.
          </p>
          <p>© 2026 BezB. Все права защищены.</p>
        </div>
      </div>
    </footer>
  )
}
