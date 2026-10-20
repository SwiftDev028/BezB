import { useEffect, useRef, useState } from 'react'
import { Check, ShoppingCart } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useCart } from '../../context/CartContext'
import { useToast } from '../../context/ToastContext'
import { btnPrimary } from '../common/ui'

interface AddToCartButtonProps {
  productId: string
  title: string
  available: boolean
  region?: string
  className?: string
  label?: string
}

export function AddToCartButton({
  productId,
  title,
  available,
  region,
  className = '',
  label = 'В корзину',
}: AddToCartButtonProps) {
  const { add } = useCart()
  const { notify } = useToast()
  const reduce = useReducedMotion()
  const [justAdded, setJustAdded] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!available) {
    return (
      <button type="button" disabled className={`${btnPrimary} ${className}`}>
        Нет в наличии
      </button>
    )
  }

  return (
    <motion.button
      type="button"
      aria-label={`${label}: ${title}`}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      onClick={() => {
        add(productId, region)
        notify('Добавлено в корзину')
        setJustAdded(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setJustAdded(false), 1400)
      }}
      className={`${btnPrimary} ${className}`}
    >
      {justAdded ? (
        <>
          <Check className="size-5" aria-hidden="true" /> Добавлено
        </>
      ) : (
        <>
          <ShoppingCart className="size-5" aria-hidden="true" /> {label}
        </>
      )}
    </motion.button>
  )
}
