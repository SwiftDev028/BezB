import { Heart } from 'lucide-react'
import { useFavorites } from '../../context/FavoritesContext'
import { useToast } from '../../context/ToastContext'

interface FavoriteButtonProps {
  productId: string
  title: string
  className?: string
}

export function FavoriteButton({ productId, title, className = '' }: FavoriteButtonProps) {
  const { has, toggle } = useFavorites()
  const { notify } = useToast()
  const active = has(productId)

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Убрать из избранного: ${title}` : `Добавить в избранное: ${title}`}
      onClick={() => {
        toggle(productId)
        notify(active ? 'Убрано из избранного' : 'Добавлено в избранное')
      }}
      className={`grid size-11 place-items-center bg-ink/80 text-white transition-colors hover:bg-steel ${className}`}
    >
      <Heart
        aria-hidden="true"
        className={`size-5 transition-transform ${active ? 'scale-110 fill-red text-red' : ''}`}
      />
    </button>
  )
}
