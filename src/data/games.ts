import type { GamePage } from '../types'

/**
 * Страницы игр. Здесь только подтверждённая информация.
 * Цен, SKU и наличия нет намеренно: товары показываются, только если они появились в каталоге.
 */
export const games: GamePage[] = [
  {
    slug: 'grand-theft-auto-vi',
    title: 'Grand Theft Auto VI',
    publisher: 'Rockstar Games',
    description:
      'Новая глава легендарной серии Rockstar Games с масштабным открытым миром, яркими героями и криминальной историей в современном Вайс-Сити. Исследуйте улицы, побережья и районы штата Леонида, участвуйте в динамичных погонях, ограблениях и сюжетных миссиях.',
    cover: 'images/games/gta-vi.webp',
    coverAlt: 'Официальный постер Grand Theft Auto VI: двое героев на капоте автомобиля на фоне пальм и закатного Вайс-Сити',
    accent: '#ff4fa3',
    releaseNote: null,
    platforms: [
      { category: 'playstation', label: 'PlayStation 5' },
      { category: 'xbox', label: 'Xbox Series X|S' },
    ],
    catalogTitlePattern: /grand theft auto\s+(vi|6)(?![\p{L}\p{N}])/iu,
    platformNote:
      'Платформы указаны по официальному анонсу Rockstar Games. Товары GTA VI появятся в BezB только после подтверждения поставщиком — пока их в каталоге нет, если ниже не показаны карточки.',
  },
]

export function getGame(slug: string | undefined): GamePage | undefined {
  return games.find((g) => g.slug === slug)
}
