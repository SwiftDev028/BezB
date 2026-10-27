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
  {
    slug: 'phantom-blade-zero',
    title: 'Phantom Blade Zero',
    description:
      'Мрачный экшен-RPG в стилистике уся на Unreal Engine 5. Соула обвиняют в убийстве наставника. Получив смертельное ранение в сердце, он располагает всего 66 днями, чтобы раскрыть заговор в Улине. Боевая система построена на ритме кунг-фу: синие приёмы Brutal необходимо парировать, а красные Killer — обходить с помощью Ghoststep, чтобы оказаться за спиной противника. В арсенале — более 30 видов оружия и около 20 призрачных орудий. В игре есть русские субтитры, но нет русской озвучки. Доступны версии для Steam, PS5 и Epic Games; для PS5 предусмотрено издание Digital Deluxe Edition с дополнительными материалами. На этой странице подготовлены только варианты PS5.',
    accent: '#bb4b3b',
    releaseNote: null,
    platforms: [{ category: 'playstation', label: 'PlayStation 5' }],
    catalogTitlePattern: /^Phantom Blade Zero(?:\s|$)/iu,
    platformNote:
      'На этом этапе в BezB подготовлены только варианты для PlayStation 5. Товары Steam и Epic Games не создаются.',
  },
]

export function getGame(slug: string | undefined): GamePage | undefined {
  return games.find((g) => g.slug === slug)
}
