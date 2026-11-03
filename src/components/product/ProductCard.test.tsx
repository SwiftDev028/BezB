// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { makeProduct } from '../../test/factories'
import { ProductCard } from './ProductCard'

vi.mock('../common/ProductArt', () => ({
  ProductArt: () => <div data-testid="product-art" className="aspect-video" />,
}))
vi.mock('./AddToCartButton', () => ({ AddToCartButton: () => <button>В корзину</button> }))
vi.mock('./FavoriteButton', () => ({ FavoriteButton: () => null }))
vi.mock('./Price', () => ({ Price: () => <p data-testid="product-price">Цена</p> }))

afterEach(() => cleanup())

describe('ProductCard consistent content sizing', () => {
  it('reserves the same title, metadata, and description areas for short and long content', () => {
    const products = [
      makeProduct({ id: 'short', title: 'Short title', description: 'Short description' }),
      makeProduct({
        id: 'long',
        title: 'A very long product title that should be clamped to two lines',
        description: 'A long description '.repeat(30),
      }),
    ]
    const { container, getAllByRole, getAllByTestId } = render(
      <MemoryRouter>
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </MemoryRouter>,
    )

    expect(container.querySelectorAll('article')).toHaveLength(2)
    for (const card of container.querySelectorAll('article')) {
      expect(card.className).toContain('h-full')
      expect(card.querySelector('h3')?.className).toContain('line-clamp-2')
      expect(card.querySelector('h3')?.className).toContain('h-[2.4em]')
      expect(card.querySelectorAll('p.h-10')).toHaveLength(2)
      expect(card.querySelector('div.min-h-24')).toBeTruthy()
    }
    expect(getAllByTestId('product-art')).toHaveLength(2)
    expect(getAllByTestId('product-price')).toHaveLength(2)
    expect(getAllByRole('link')).toHaveLength(4)
  })
})
