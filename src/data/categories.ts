import type { Category, CategoryId } from '../types'

export const categories: Category[] = [
  {
    id: 'apple',
    title: 'Apple',
    short: 'Gift Cards',
    description:
      'Подарочные карты Apple разных номиналов для пополнения баланса Apple Account. Регион карты выбирается на странице товара.',
    accent: '#e8e8ec',
    types: ['gift-card'],
  },
  {
    id: 'xbox',
    title: 'Xbox',
    short: 'Игры и подписки',
    description: 'Игры, подписки Game Pass и карты пополнения для консолей Xbox и ПК.',
    accent: '#35c24a',
    types: ['game', 'subscription', 'topup'],
  },
  {
    id: 'playstation',
    title: 'PlayStation',
    short: 'Игры и подписки',
    description: 'Игры, подписки PlayStation Plus и карты пополнения кошелька для PS4 и PS5.',
    accent: '#3d7bff',
    types: ['game', 'subscription', 'topup'],
  },
  {
    id: 'steam',
    title: 'Steam',
    short: 'Игры и баланс',
    description: 'Пополнение баланса Steam и игры для ПК.',
    accent: '#7fb7e6',
    types: ['game', 'topup'],
  },
  {
    id: 'ai',
    title: 'AI-сервисы',
    short: 'ChatGPT, Claude и др.',
    description:
      'Подписки и кредиты для AI-инструментов. Оформление — только по официальным условиям сервисов, без передачи чужих аккаунтов.',
    accent: '#e10600',
    types: ['subscription', 'topup'],
  },
]

export const categoryById: Record<CategoryId, Category> = Object.fromEntries(
  categories.map((c) => [c.id, c]),
) as Record<CategoryId, Category>

export const typeLabels = {
  'gift-card': 'Подарочная карта',
  game: 'Игра',
  subscription: 'Подписка',
  topup: 'Пополнение',
} as const
