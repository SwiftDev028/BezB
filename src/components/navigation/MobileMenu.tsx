import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import { Logo } from '../common/Logo'
import { infoNav, mainNav } from './navItems'

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const firstPath = useRef(pathname)

  // Закрываем меню при переходе на другую страницу
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname
      onClose()
    }
  }, [pathname, onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-12 items-center border-l-4 px-4 font-display text-xl uppercase tracking-wide ${
      isActive ? 'border-red bg-steel text-white' : 'border-transparent text-silver hover:bg-graphite hover:text-white'
    }`

  return (
    <div className="fixed inset-0 z-[90] lg:hidden">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Меню"
        className="texture-hatch absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col overflow-y-auto border-r border-line bg-coal"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть меню"
            className="grid size-11 place-items-center hover:bg-steel"
          >
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Основное меню" className="py-2">
          {mainNav.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <nav aria-label="Информация" className="mt-auto border-t border-line py-2">
          {infoNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className="flex min-h-11 items-center px-5 text-sm text-silver hover:text-white"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
