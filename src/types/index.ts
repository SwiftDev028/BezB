export type CategoryId = 'apple' | 'xbox' | 'playstation' | 'steam' | 'ai'

export type ProductType = 'gift-card' | 'game' | 'subscription' | 'topup'

export type ProductBadge = 'popular' | 'new' | 'sale'

export type Currency = 'RUB'

export interface Product {
  id: string
  slug: string
  title: string
  category: CategoryId
  /** Отображаемое название платформы, например «Xbox Series X|S» */
  platform: string
  type: ProductType
  /** Демонстрационная цена в минимальной единице отображения (рубли) */
  price: number
  oldPrice?: number
  currency: Currency
  badge?: ProductBadge
  description: string
  /** Как будет выдаваться товар. Пока — общий текст, помеченный как требующий заполнения */
  delivery: string
  restrictions: string[]
  /** Доступные регионы активации, если применимо — пользователь выбирает один */
  regions?: string[]
  available: boolean
  /** Для сортировки «Новинки» и «Популярные» */
  popularity: number
  addedAt: string
  tags: string[]
  /** Live Supabase catalog metadata. */
  groupId?: string
  brand?: string
  country?: string
  denomination?: number | null
  denominationCurrency?: string | null
  /** Structured subscription term; bonus months are promotional and not charged separately. */
  subscriptionMonths?: number | null
  subscriptionBonusMonths?: number
  imageUrl?: string | null
  activationInstructions?: string
}

export interface Category {
  id: CategoryId
  title: string
  short: string
  description: string
  /** Цвет акцента карточки категории (заглушка вместо баннера) */
  accent: string
  /** Какие типы товаров имеет смысл фильтровать */
  types: ProductType[]
}

export interface Banner {
  id: string
  eyebrow: string
  title: string
  text: string
  cta: string
  to: string
  accent: string
}

export interface FaqItem {
  id: string
  question: string
  answer: string
}

export interface CartItem {
  productId: string
  quantity: number
  region?: string
}

export type SortKey = 'popular' | 'price-asc' | 'price-desc' | 'new' | 'title'

export interface CatalogFilters {
  query: string
  category: CategoryId | 'all'
  type: ProductType | 'all'
  platform: string | 'all'
  /** Регион активации, как в каталоге («Турция») */
  region: string | 'all'
  /** Сервис / бренд («ChatGPT», «Claude») */
  brand: string | 'all'
  minPrice: number | null
  maxPrice: number | null
  onlyAvailable: boolean
  sort: SortKey
}

export * from './orders'
