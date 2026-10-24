import type { CategoryId, ProductType } from '../../types'

interface ProductArtProps {
  category: CategoryId
  type: ProductType
  label?: string
  imageUrl?: string | null
  className?: string
}

/** Локальная заглушка вместо фотографии товара — заменяется реальным изображением позже. */
export function ProductArt({ label, imageUrl, className = '' }: ProductArtProps) {
  return (
    <div
      className={`relative aspect-[4/3] w-full overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />}
      <div className="absolute inset-x-0 bottom-1 flex items-center gap-2 p-3">
        {label && (
          <span className="truncate font-display text-sm uppercase tracking-wide text-silver">{label}</span>
        )}
      </div>
    </div>
  )
}
