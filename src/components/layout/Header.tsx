import { useCallback, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { CircleUserRound, Heart, Menu, ShoppingCart } from 'lucide-react'
import { useCart } from '../../context/CartContext'
import { useFavorites } from '../../context/FavoritesContext'
import { Logo } from '../common/Logo'
import { MobileMenu } from '../navigation/MobileMenu'
import { SearchBox } from '../navigation/SearchBox'
import { mainNav } from '../navigation/navItems'

function CounterIcon({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <span className="relative">
      {children}
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-2 -top-2 grid min-w-5 place-items-center bg-red px-1 text-[11px] font-bold leading-5 text-white"
        >
          {count}
        </span>
      )}
    </span>
  )
}

export function Header() {
  const { count } = useCart()
  const favorites = useFavorites()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const iconLink =
    'grid size-11 place-items-center text-white transition-colors hover:bg-steel'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur">
      <div className="container-x">
        <div className="flex items-center gap-2 py-2 lg:gap-6">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Открыть меню"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation-menu"
            className={`${iconLink} lg:hidden`}
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
          <Logo />

          <SearchBox className="mx-2 hidden max-w-xl flex-1 md:block lg:mx-6" />

          <div className="ml-auto flex items-center">
            <Link
              to="/favorites"
              className={iconLink}
              aria-label={`Избранное${favorites.ids.length ? `, товаров: ${favorites.ids.length}` : ''}`}
            >
              <CounterIcon count={favorites.ids.length}>
                <Heart className="size-6" aria-hidden="true" />
              </CounterIcon>
            </Link>
            <Link to="/account" className={iconLink} aria-label="Личный кабинет"><CircleUserRound className="size-6" aria-hidden="true" /></Link>
            <Link
              to="/cart"
              className={iconLink}
              aria-label={`Корзина${count ? `, товаров: ${count}` : ''}`}
            >
              <CounterIcon count={count}>
                <ShoppingCart className="size-6" aria-hidden="true" />
              </CounterIcon>
            </Link>
          </div>
        </div>

        <div className="pb-2 md:hidden">
          <SearchBox />
        </div>

        <nav aria-label="Основная навигация" className="hidden border-t border-line lg:block">
          <ul className="flex gap-1">
            {mainNav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `relative inline-flex min-h-11 items-center px-4 font-display text-base uppercase tracking-wide transition-colors ${
                      isActive
                        ? 'text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-red'
                        : 'text-silver hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </header>
  )
}
