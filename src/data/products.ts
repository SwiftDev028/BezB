import type { CategoryId, Product, ProductBadge, ProductType } from '../types'

/**
 * ДЕМОНСТРАЦИОННЫЙ КАТАЛОГ.
 * Все цены и позиции — тестовые. Названия игр вымышлены и служат местом под реальные товары.
 * Когда появится подтверждённый поставщик, этот файл заменяется загрузкой из API,
 * интерфейс (`Product`) останется прежним.
 */

const DELIVERY_TBD =
  'Способ и срок получения будут указаны после подключения подтверждённого поставщика. [Требует заполнения]'

const DEMO_NOTE = 'Демонстрационная позиция: цена и наличие тестовые.'

interface Seed {
  slug: string
  title: string
  category: CategoryId
  platform: string
  type: ProductType
  price: number
  oldPrice?: number
  badge?: ProductBadge
  description: string
  restrictions?: string[]
  regions?: string[]
  available?: boolean
  popularity: number
  addedAt: string
  tags?: string[]
}

function make(seed: Seed): Product {
  return {
    id: seed.slug,
    slug: seed.slug,
    title: seed.title,
    category: seed.category,
    platform: seed.platform,
    type: seed.type,
    price: seed.price,
    oldPrice: seed.oldPrice,
    currency: 'RUB',
    badge: seed.badge,
    description: `${seed.description} ${DEMO_NOTE}`,
    delivery: DELIVERY_TBD,
    restrictions: seed.restrictions ?? [
      'Проверьте регион и платформу перед покупкой.',
      'Цифровые товары после выдачи возврату, как правило, не подлежат — подробности в правилах возврата.',
    ],
    regions: seed.regions,
    available: seed.available ?? true,
    popularity: seed.popularity,
    addedAt: seed.addedAt,
    tags: seed.tags ?? [],
  }
}

const appleRegions = ['США', 'Европа', 'Турция']

const gameRestrictions = [
  'Игра выдаётся для указанной платформы и региона аккаунта.',
  'Проверьте системные требования и возрастной рейтинг.',
  'Цифровые товары после выдачи возврату, как правило, не подлежат.',
]

export const products: Product[] = [
  // Apple
  make({
    slug: 'apple-gift-card-500',
    title: 'Apple Gift Card 500 ₽',
    category: 'apple',
    platform: 'Apple',
    type: 'gift-card',
    price: 550,
    description: 'Подарочная карта Apple номиналом 500 ₽ для пополнения баланса Apple Account.',
    regions: appleRegions,
    popularity: 70,
    addedAt: '2026-08-01',
    tags: ['apple', 'app store', 'itunes', 'icloud'],
  }),
  make({
    slug: 'apple-gift-card-1000',
    title: 'Apple Gift Card 1000 ₽',
    category: 'apple',
    platform: 'Apple',
    type: 'gift-card',
    price: 1090,
    badge: 'popular',
    description: 'Подарочная карта Apple номиналом 1000 ₽ для приложений, игр, подписок и iCloud+.',
    regions: appleRegions,
    popularity: 95,
    addedAt: '2026-08-01',
    tags: ['apple', 'app store', 'itunes', 'icloud'],
  }),
  make({
    slug: 'apple-gift-card-2500',
    title: 'Apple Gift Card 2500 ₽',
    category: 'apple',
    platform: 'Apple',
    type: 'gift-card',
    price: 2690,
    description: 'Подарочная карта Apple номиналом 2500 ₽.',
    regions: appleRegions,
    popularity: 80,
    addedAt: '2026-08-01',
    tags: ['apple', 'app store'],
  }),
  make({
    slug: 'apple-gift-card-5000',
    title: 'Apple Gift Card 5000 ₽',
    category: 'apple',
    platform: 'Apple',
    type: 'gift-card',
    price: 5290,
    oldPrice: 5490,
    badge: 'sale',
    description: 'Подарочная карта Apple номиналом 5000 ₽ для крупных покупок и подписок.',
    regions: appleRegions,
    popularity: 60,
    addedAt: '2026-08-01',
    tags: ['apple', 'app store'],
  }),

  // Xbox
  make({
    slug: 'xbox-game-pass-ultimate-1m',
    title: 'Xbox Game Pass Ultimate — 1 месяц',
    category: 'xbox',
    platform: 'Xbox / ПК',
    type: 'subscription',
    price: 1190,
    badge: 'popular',
    description: 'Подписка на каталог игр для консоли и ПК. Условия — по правилам Microsoft.',
    popularity: 98,
    addedAt: '2026-09-02',
    tags: ['game pass', 'подписка', 'xbox'],
  }),
  make({
    slug: 'xbox-game-pass-core-3m',
    title: 'Xbox Game Pass Core — 3 месяца',
    category: 'xbox',
    platform: 'Xbox',
    type: 'subscription',
    price: 1990,
    description: 'Онлайн-игра и подборка игр по подписке на 3 месяца.',
    popularity: 66,
    addedAt: '2026-07-10',
    tags: ['game pass', 'подписка', 'xbox'],
  }),
  make({
    slug: 'xbox-gift-card-1500',
    title: 'Xbox Gift Card 1500 ₽',
    category: 'xbox',
    platform: 'Xbox / ПК',
    type: 'topup',
    price: 1590,
    description: 'Карта пополнения баланса Microsoft для покупки игр и дополнений.',
    regions: ['США', 'Европа', 'Турция'],
    popularity: 72,
    addedAt: '2026-06-15',
    tags: ['пополнение', 'xbox', 'microsoft store'],
  }),
  make({
    slug: 'xbox-neon-riot',
    title: 'Neon Riot (Xbox)',
    category: 'xbox',
    platform: 'Xbox Series X|S',
    type: 'game',
    price: 3290,
    oldPrice: 3990,
    badge: 'sale',
    description: 'Экшен в неоновом городе. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 84,
    addedAt: '2026-09-20',
    tags: ['экшен', 'xbox'],
  }),
  make({
    slug: 'xbox-iron-chorus',
    title: 'Iron Chorus (Xbox)',
    category: 'xbox',
    platform: 'Xbox Series X|S',
    type: 'game',
    price: 2490,
    badge: 'new',
    description: 'Ритмичный боевик с гитарными боссами. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 58,
    addedAt: '2026-10-10',
    tags: ['музыка', 'боевик', 'xbox'],
  }),

  // PlayStation
  make({
    slug: 'ps-plus-essential-1m',
    title: 'PlayStation Plus Essential — 1 месяц',
    category: 'playstation',
    platform: 'PS4 / PS5',
    type: 'subscription',
    price: 890,
    description: 'Онлайн-игра и ежемесячные игры по подписке. Условия — по правилам Sony.',
    popularity: 90,
    addedAt: '2026-07-20',
    tags: ['ps plus', 'подписка', 'playstation'],
  }),
  make({
    slug: 'ps-plus-extra-3m',
    title: 'PlayStation Plus Extra — 3 месяца',
    category: 'playstation',
    platform: 'PS4 / PS5',
    type: 'subscription',
    price: 3490,
    badge: 'popular',
    description: 'Расширенный каталог игр на 3 месяца.',
    popularity: 92,
    addedAt: '2026-08-14',
    tags: ['ps plus', 'подписка', 'playstation'],
  }),
  make({
    slug: 'psn-wallet-2000',
    title: 'Пополнение PlayStation Store 2000 ₽',
    category: 'playstation',
    platform: 'PS4 / PS5',
    type: 'topup',
    price: 2150,
    description: 'Карта пополнения кошелька PlayStation Store.',
    regions: ['США', 'Европа', 'Турция'],
    popularity: 74,
    addedAt: '2026-06-02',
    tags: ['пополнение', 'psn', 'playstation'],
  }),
  make({
    slug: 'ps5-chrome-saints',
    title: 'Chrome Saints (PS5)',
    category: 'playstation',
    platform: 'PS5',
    type: 'game',
    price: 4290,
    badge: 'new',
    description: 'Киберпанк-экшен от третьего лица. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 77,
    addedAt: '2026-10-12',
    tags: ['киберпанк', 'экшен', 'ps5'],
  }),
  make({
    slug: 'ps5-black-circuit',
    title: 'Black Circuit (PS5)',
    category: 'playstation',
    platform: 'PS5',
    type: 'game',
    price: 3190,
    description: 'Гоночная аркада по ночным трассам. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    available: false,
    popularity: 40,
    addedAt: '2026-05-20',
    tags: ['гонки', 'ps5'],
  }),
  make({
    slug: 'ps4-redline-vault',
    title: 'Redline Vault (PS4)',
    category: 'playstation',
    platform: 'PS4',
    type: 'game',
    price: 1790,
    oldPrice: 2290,
    badge: 'sale',
    description: 'Стелс-ограбления в стиле нуар. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 52,
    addedAt: '2026-04-11',
    tags: ['стелс', 'ps4'],
  }),

  // Steam
  make({
    slug: 'steam-topup-500',
    title: 'Пополнение Steam 500 ₽',
    category: 'steam',
    platform: 'Steam / ПК',
    type: 'topup',
    price: 560,
    description: 'Пополнение баланса Steam на 500 ₽.',
    popularity: 78,
    addedAt: '2026-06-01',
    tags: ['steam', 'пополнение', 'кошелёк'],
  }),
  make({
    slug: 'steam-topup-1000',
    title: 'Пополнение Steam 1000 ₽',
    category: 'steam',
    platform: 'Steam / ПК',
    type: 'topup',
    price: 1110,
    badge: 'popular',
    description: 'Пополнение баланса Steam на 1000 ₽.',
    popularity: 96,
    addedAt: '2026-06-01',
    tags: ['steam', 'пополнение', 'кошелёк'],
  }),
  make({
    slug: 'steam-topup-3000',
    title: 'Пополнение Steam 3000 ₽',
    category: 'steam',
    platform: 'Steam / ПК',
    type: 'topup',
    price: 3290,
    description: 'Пополнение баланса Steam на 3000 ₽.',
    popularity: 64,
    addedAt: '2026-06-01',
    tags: ['steam', 'пополнение', 'кошелёк'],
  }),
  make({
    slug: 'steam-static-bloom',
    title: 'Static Bloom (Steam)',
    category: 'steam',
    platform: 'ПК',
    type: 'game',
    price: 1290,
    badge: 'new',
    description: 'Атмосферная инди-головоломка про радиоволны. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 55,
    addedAt: '2026-10-05',
    tags: ['инди', 'головоломка', 'пк'],
  }),
  make({
    slug: 'steam-iron-chorus-pc',
    title: 'Iron Chorus (Steam)',
    category: 'steam',
    platform: 'ПК',
    type: 'game',
    price: 2290,
    oldPrice: 2690,
    badge: 'sale',
    description: 'Ритмичный боевик с гитарными боссами для ПК. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 68,
    addedAt: '2026-09-28',
    tags: ['музыка', 'боевик', 'пк'],
  }),
  make({
    slug: 'steam-grid-zero',
    title: 'Grid Zero (Steam)',
    category: 'steam',
    platform: 'ПК',
    type: 'game',
    price: 1990,
    description: 'Тактическая стратегия в сетевом киберпространстве. Вымышленное название — место под реальный товар.',
    restrictions: gameRestrictions,
    popularity: 61,
    addedAt: '2026-07-30',
    tags: ['стратегия', 'пк'],
  }),

  // AI
  make({
    slug: 'ai-chatgpt-plus-1m',
    title: 'ChatGPT Plus — 1 месяц',
    category: 'ai',
    platform: 'ChatGPT',
    type: 'subscription',
    price: 2190,
    badge: 'popular',
    description:
      'Оформление подписки ChatGPT Plus по официальным условиям сервиса. Способ активации будет описан после подтверждения поставщика.',
    restrictions: [
      'Подписка оформляется на ваш собственный аккаунт — передача чужих аккаунтов не предусмотрена.',
      'Доступность и условия определяются сервисом.',
    ],
    popularity: 99,
    addedAt: '2026-09-01',
    tags: ['chatgpt', 'openai', 'ai', 'подписка'],
  }),
  make({
    slug: 'ai-claude-pro-1m',
    title: 'Claude Pro — 1 месяц',
    category: 'ai',
    platform: 'Claude',
    type: 'subscription',
    price: 2190,
    badge: 'popular',
    description:
      'Оформление подписки Claude Pro по официальным условиям сервиса. Способ активации будет описан после подтверждения поставщика.',
    restrictions: [
      'Подписка оформляется на ваш собственный аккаунт — передача чужих аккаунтов не предусмотрена.',
      'Доступность и условия определяются сервисом.',
    ],
    popularity: 97,
    addedAt: '2026-09-01',
    tags: ['claude', 'anthropic', 'ai', 'подписка'],
  }),
  make({
    slug: 'ai-api-credits-1000',
    title: 'Кредиты для AI API — 1000 ₽',
    category: 'ai',
    platform: 'AI API',
    type: 'topup',
    price: 1190,
    badge: 'new',
    description: 'Пополнение баланса для доступа к AI API разработчика. Провайдер уточняется.',
    restrictions: [
      'Для использования нужен собственный аккаунт разработчика.',
      'Провайдер и условия пополнения будут указаны позже. [Требует заполнения]',
    ],
    popularity: 63,
    addedAt: '2026-10-14',
    tags: ['api', 'кредиты', 'ai'],
  }),
  make({
    slug: 'ai-image-tools-1m',
    title: 'AI для изображений — 1 месяц',
    category: 'ai',
    platform: 'Генерация изображений',
    type: 'subscription',
    price: 1490,
    description: 'Подписка на сервис генерации изображений. Конкретный сервис уточняется.',
    restrictions: [
      'Подписка оформляется на ваш собственный аккаунт.',
      'Сервис и условия будут указаны позже. [Требует заполнения]',
    ],
    available: false,
    popularity: 45,
    addedAt: '2026-08-25',
    tags: ['изображения', 'ai', 'подписка'],
  }),
]

export const productBySlug: Record<string, Product> = Object.fromEntries(
  products.map((p) => [p.slug, p]),
)

export function getProduct(id: string): Product | undefined {
  return productBySlug[id]
}
