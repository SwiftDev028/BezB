import { useState } from 'react'
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
  const [loadedImage, setLoadedImage] = useState<{ src: string; fit: 'cover' | 'contain' } | null>(null)
  const imageFit = loadedImage && loadedImage.src === imageUrl ? loadedImage.fit : 'contain'

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget
            const aspectRatio = naturalWidth / naturalHeight
            setLoadedImage({
              src: imageUrl,
              fit: aspectRatio >= 1.25 && aspectRatio <= 2.2 ? 'cover' : 'contain',
            })
          }}
          className={`absolute inset-0 size-full object-center ${imageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
        />
      )}
      <div className="absolute inset-x-0 bottom-1 flex items-center gap-2 p-3">
        {label && (
          <span className="truncate font-display text-sm uppercase tracking-wide text-silver">{label}</span>
        )}
      </div>
    </div>
  )
}
