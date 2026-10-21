import { describe, expect, it } from 'vitest'
import { defaultFilters } from './catalog'
import { filtersFromParams, filtersToParams } from './filterParams'

describe('параметры фильтров в URL', () => {
  it('пустой URL даёт значения по умолчанию', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(defaultFilters)
  })

  it('читает и записывает фильтры без потерь', () => {
    const filters = {
      ...defaultFilters,
      query: 'game pass',
      category: 'xbox' as const,
      type: 'subscription' as const,
      region: 'USA',
      denomination: '25:USD',
      minPrice: 500,
      maxPrice: 2000,
      onlyAvailable: true,
      sort: 'price-asc' as const,
    }
    expect(filtersFromParams(filtersToParams(filters))).toEqual(filters)
  })

  it('игнорирует некорректные значения', () => {
    const params = new URLSearchParams('cat=bad&type=bad&sort=bad&min=abc&max=-5')
    expect(filtersFromParams(params)).toEqual(defaultFilters)
  })

  it('фиксированная категория имеет приоритет над параметром', () => {
    expect(filtersFromParams(new URLSearchParams('cat=steam'), 'ai').category).toBe('ai')
  })

  it('значения по умолчанию не попадают в URL', () => {
    expect(filtersToParams(defaultFilters).toString()).toBe('')
  })
})
