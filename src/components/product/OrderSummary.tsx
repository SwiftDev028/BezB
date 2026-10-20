import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../utils/format'

export function OrderSummary() {
  const { count, total } = useCart()
  return (
    <div className="texture-hatch border border-line bg-coal p-5">
      <h2 className="mb-4 text-2xl">Итого</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-silver">Товаров</dt>
          <dd>{count}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <dt className="text-silver">Демонстрационная сумма</dt>
          <dd className="font-display text-3xl font-bold text-white">{formatPrice(total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-silver">Цены тестовые. Реальная оплата не подключена.</p>
    </div>
  )
}
