import { describe, expect, it } from 'vitest'
import { banners } from './banners'
import { games, getGame } from './games'

describe('страницы игр', () => {
  it('slug игр уникальны', () => {
    expect(new Set(games.map((g) => g.slug)).size).toBe(games.length)
  })

  it('баннеры, ведущие на /game/, указывают на существующую игру', () => {
    for (const banner of banners.filter((b) => b.to.startsWith('/game/'))) {
      expect(getGame(banner.to.replace('/game/', ''))).toBeDefined()
    }
  })

  it('шаблон GTA VI не цепляет другие игры серии', () => {
    const pattern = getGame('grand-theft-auto-vi')!.catalogTitlePattern
    expect(pattern.test('Grand Theft Auto VI (PS5)')).toBe(true)
    expect(pattern.test('Grand Theft Auto V')).toBe(false)
    expect(pattern.test('Grand Theft Auto: Vice City')).toBe(false)
  })
})
