import { Apple, Bot, CalendarClock, Gamepad2, Gift, Joystick, MonitorPlay, Wallet } from 'lucide-react'
import type { CategoryId, ProductType } from '../../types'
import { categoryById } from '../../data/categories'

const categoryIcon = {
  apple: Apple,
  xbox: Gamepad2,
  playstation: Joystick,
  steam: MonitorPlay,
  ai: Bot,
} as const

const typeIcon = {
  'gift-card': Gift,
  game: Gamepad2,
  subscription: CalendarClock,
  topup: Wallet,
} as const

interface ProductArtProps {
  category: CategoryId
  type: ProductType
  label?: string
  className?: string
}

/** Локальная заглушка вместо фотографии товара — заменяется реальным изображением позже. */
export function ProductArt({ category, type, label, className = '' }: ProductArtProps) {
  const accent = categoryById[category].accent
  const Icon = categoryIcon[category]
  const TypeIcon = typeIcon[type]
  return (
    <div
      className={`texture-hatch relative aspect-[4/3] w-full overflow-hidden bg-graphite ${className}`}
      aria-hidden="true"
    >
      <div
        className="absolute -right-6 -top-8 h-[140%] w-1/2 -skew-x-[18deg] opacity-90"
        style={{ background: `linear-gradient(180deg, ${accent}, transparent 85%)`, opacity: 0.22 }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: accent }} />
      <Icon className="absolute right-4 top-1/2 size-24 -translate-y-1/2 text-white/10" strokeWidth={1.25} />
      <div className="absolute inset-x-0 bottom-1 flex items-center gap-2 p-3">
        <span
          className="grid size-9 shrink-0 place-items-center bg-ink/70 text-white"
          style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
        >
          <TypeIcon className="size-5" />
        </span>
        {label && (
          <span className="truncate font-display text-sm uppercase tracking-wide text-silver">{label}</span>
        )}
      </div>
    </div>
  )
}
