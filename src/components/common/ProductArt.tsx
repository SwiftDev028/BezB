import { useEffect, useState } from 'react'
import type { CategoryId, ProductType } from '../../types'

const MAX_IMAGE_RETRIES = 1
const IMAGE_RETRY_DELAY_MS = 800

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
      className={`relative aspect-video w-full overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {imageUrl && <ProductImage key={imageUrl} src={imageUrl} />}
      <div className="absolute inset-x-0 bottom-1 flex items-center gap-2 p-3">
        {label && (
          <span className="truncate font-display text-sm uppercase tracking-wide text-silver">{label}</span>
        )}
      </div>
    </div>
  )
}

function ProductImage({ src }: { src: string }) {
  const [retryCount, setRetryCount] = useState(0)
  const [retryPending, setRetryPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [imageFit, setImageFit] = useState<'cover' | 'contain'>('contain')

  useEffect(() => {
    if (!retryPending) return
    const timer = window.setTimeout(() => {
      setRetryCount((count) => count + 1)
      setRetryPending(false)
    }, IMAGE_RETRY_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [retryPending])

  if (failed || retryPending) {
    return (
      <div className="absolute inset-0 grid place-items-center px-3 text-center text-sm text-silver" role="status">
        {retryPending ? 'Повторная загрузка изображения…' : 'Изображение временно недоступно'}
      </div>
    )
  }

  return (
    <img
      key={retryCount}
      src={src}
      alt=""
      loading="lazy"
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget
        const aspectRatio = naturalWidth / naturalHeight
        setImageFit(aspectRatio >= 1.25 && aspectRatio <= 2.2 ? 'cover' : 'contain')
      }}
      onError={() => {
        if (retryCount < MAX_IMAGE_RETRIES) setRetryPending(true)
        else setFailed(true)
      }}
      className={`absolute inset-0 size-full object-center ${imageFit === 'cover' ? 'object-cover' : 'object-contain'}`}
    />
  )
}
