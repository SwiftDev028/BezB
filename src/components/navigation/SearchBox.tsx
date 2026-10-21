import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useCatalog } from '../../context/CatalogContext'
import { suggest } from '../../utils/catalog'
import { formatPrice } from '../../utils/format'

interface SearchBoxProps {
  className?: string
  onNavigate?: () => void
}

export function SearchBox({ className = '', onNavigate }: SearchBoxProps) {
  const navigate = useNavigate()
  const { products } = useCatalog()
  const uid = useId()
  const listId = `${uid}-list`
  const wrapRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const items = useMemo(() => suggest(products, query), [products, query])
  const showList = open && items.length > 0

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const go = (path: string) => {
    setOpen(false)
    setActive(-1)
    onNavigate?.()
    navigate(path)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (active >= 0 && items[active]) {
      go(`/product/${items[active].slug}`)
      setQuery('')
      return
    }
    const q = query.trim()
    if (q) go(`/search?q=${encodeURIComponent(q)}`)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    } else if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % items.length)
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault()
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1))
    }
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <form role="search" onSubmit={submit} className="flex">
        <label htmlFor={`${uid}-input`} className="sr-only">
          Поиск по каталогу
        </label>
        <input
          id={`${uid}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Поиск игр, карт, подписок"
          className="min-h-11 min-w-0 flex-1 border border-r-0 border-line bg-coal px-3 text-base text-white placeholder:text-silver/70 hover:border-silver"
        />
        <button
          type="submit"
          aria-label="Найти"
          className="grid min-h-11 w-12 shrink-0 place-items-center bg-red text-white transition-colors hover:bg-red-hot"
        >
          <Search className="size-5" aria-hidden="true" />
        </button>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Подсказки"
          className="absolute inset-x-0 top-full z-50 mt-1 border border-line bg-graphite shadow-2xl"
        >
          {items.map((p, i) => (
            <li
              key={p.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                go(`/product/${p.slug}`)
                setQuery('')
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? 'bg-steel' : ''
              }`}
            >
              <span className="min-w-0 truncate">{p.title}</span>
              <span className="shrink-0 font-semibold text-silver">{formatPrice(p.price, p.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
