import { Link } from 'react-router-dom'
import { Apple, ArrowUpRight, Bot, Gamepad2, Joystick, MonitorPlay } from 'lucide-react'
import { categories } from '../../data/categories'
import { products } from '../../data/products'

const icons = { apple: Apple, xbox: Gamepad2, playstation: Joystick, steam: MonitorPlay, ai: Bot } as const

export function CategoryTiles() {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {categories.map((c, i) => {
        const Icon = icons[c.id]
        const total = products.filter((p) => p.category === c.id).length
        return (
          <li key={c.id} className={i === categories.length - 1 ? 'col-span-2 md:col-span-1' : ''}>
            <Link
              to={`/category/${c.id}`}
              className="texture-hatch group relative flex h-full min-h-40 flex-col justify-between overflow-hidden border border-line bg-coal p-4 transition-colors hover:border-red"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 transition-all group-hover:h-1.5"
                style={{ background: c.accent }}
              />
              <Icon className="size-10 text-white/90" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <h3 className="text-2xl">{c.title}</h3>
                <p className="mt-1 text-sm text-silver">{c.short}</p>
                <p className="mt-2 flex items-center justify-between text-xs uppercase tracking-wider text-silver">
                  Товаров: {total}
                  <ArrowUpRight className="size-4 text-red transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                </p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
