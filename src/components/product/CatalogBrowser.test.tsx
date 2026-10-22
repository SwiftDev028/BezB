// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Product } from '../../types'
import { categoryById } from '../../data/categories'
import { makeProduct } from '../../test/factories'
import { CatalogBrowser } from './CatalogBrowser'

interface CatalogState {
  products: Product[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

let state: CatalogState
vi.mock('../../context/CatalogContext', () => ({ useCatalog: () => state }))
vi.mock('./ProductGrid', () => ({
  ProductGrid: ({ products }: { products: Product[] }) => (
    <ul aria-label="товары">
      {products.map((p) => (
        <li key={p.id}>{p.title}</li>
      ))}
    </ul>
  ),
}))

const apple = categoryById.apple
const cards = [
  makeProduct({ id: 'a-1', title: 'Apple Gift Card 1000', country: 'Россия', denomination: 1000, denominationCurrency: 'RUB' }),
  makeProduct({ id: 'a-2', title: 'Apple Gift Card 25', country: 'США', denomination: 25, denominationCurrency: 'USD', price: 2500 }),
  makeProduct({ id: 's-1', title: 'Пополнение Steam', category: 'steam', platform: 'Steam / ПК', type: 'topup' }),
]

function renderBrowser(path = '/category/apple') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CatalogBrowser category={apple} />
    </MemoryRouter>,
  )
}

afterEach(() => cleanup())

describe('CatalogBrowser: загрузка каталога', () => {
  it('пока данные грузятся, не показывает «ничего не найдено»', () => {
    state = { products: [], loading: true, error: null, refresh: async () => {} }
    renderBrowser()
    expect(screen.getByRole('status').textContent).toMatch(/Загружаем/)
    expect(screen.queryByText(/ничего не найдено/i)).toBeNull()
    expect(screen.queryByText(/скоро появятся/i)).toBeNull()
  })

  // Регрессия: после обновления страницы данные приходят позже первого рендера,
  // и список обязан обновиться, а не остаться пустым.
  it('показывает товары категории, когда данные пришли после первого рендера', () => {
    state = { products: [], loading: true, error: null, refresh: async () => {} }
    const view = renderBrowser()

    state = { products: cards, loading: false, error: null, refresh: async () => {} }
    view.rerender(
      <MemoryRouter initialEntries={['/category/apple']}>
        <CatalogBrowser category={apple} />
      </MemoryRouter>,
    )

    const list = screen.getByRole('list', { name: 'товары' })
    expect(list.textContent).toContain('Apple Gift Card 1000')
    expect(list.textContent).toContain('Apple Gift Card 25')
    expect(list.textContent).not.toContain('Пополнение Steam')
    expect(screen.queryByText(/ничего не найдено/i)).toBeNull()
  })

  it('при ошибке запроса показывает ошибку и кнопку повтора, а не пустую категорию', () => {
    state = { products: [], loading: false, error: 'network', refresh: async () => {} }
    renderBrowser()
    expect(screen.getByRole('alert').textContent).toMatch(/Не удалось загрузить каталог/)
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeTruthy()
    expect(screen.queryByText(/ничего не найдено/i)).toBeNull()
  })

  it('показывает пустое состояние только после успешной загрузки, если в категории нет товаров', () => {
    state = { products: [cards[2]], loading: false, error: null, refresh: async () => {} }
    renderBrowser()
    expect(screen.getByText(/ничего не найдено/i)).toBeTruthy()
  })

  it('прямая ссылка с параметрами фильтра даёт тот же результат после загрузки', () => {
    state = { products: [], loading: true, error: null, refresh: async () => {} }
    const view = renderBrowser('/category/apple?max=2000')
    state = { products: cards, loading: false, error: null, refresh: async () => {} }
    view.rerender(
      <MemoryRouter initialEntries={['/category/apple?max=2000']}>
        <CatalogBrowser category={apple} />
      </MemoryRouter>,
    )
    const text = screen.getByRole('list', { name: 'товары' }).textContent ?? ''
    expect(text).toContain('Apple Gift Card 1000')
    expect(text).not.toContain('Apple Gift Card 25')
  })
})
