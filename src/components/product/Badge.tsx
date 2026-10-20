import type { ProductBadge } from '../../types'

const labels: Record<ProductBadge, string> = {
  popular: 'Популярное',
  new: 'Новинка',
  sale: 'Акция',
}

export function Badge({ badge }: { badge: ProductBadge }) {
  const style = badge === 'sale' ? 'bg-red text-white' : badge === 'new' ? 'bg-white text-ink' : 'bg-steel text-white'
  return (
    <span className={`clip-corner-sm px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider ${style}`}>
      {labels[badge]}
    </span>
  )
}
