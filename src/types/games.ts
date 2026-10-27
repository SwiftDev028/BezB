import type { CategoryId } from './index'

export interface GamePlatform {
  /** Категория каталога BezB, в которую ведёт плитка платформы */
  category: Extract<CategoryId, 'xbox' | 'playstation' | 'steam'>
  /** Название платформы по официальному анонсу */
  label: string
}

/** Страница игры. Содержимое — только подтверждённые факты; товары берутся из живого каталога. */
export interface GamePage {
  slug: string
  title: string
  publisher: string
  description: string
  cover: string
  coverAlt: string
  accent: string
  /** Подпись про дату выхода; null — если дата не подтверждена */
  releaseNote: string | null
  platforms: GamePlatform[]
  /** Название в каталоге ищется точным совпадением, чтобы не цеплять похожие игры */
  catalogTitlePattern: RegExp
  /** Пояснение под платформами */
  platformNote: string
}
