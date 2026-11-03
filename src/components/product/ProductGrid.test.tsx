// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Product } from '../../types'
import { makeProduct } from '../../test/factories'
import { ProductGrid } from './ProductGrid'

vi.mock('./ProductCard', () => ({
  ProductCard: ({ product }: { product: Product }) => <article>{product.title}</article>,
}))

afterEach(() => cleanup())

describe('ProductGrid card sizing', () => {
  const products = [makeProduct({ id: 'short' }), makeProduct({ id: 'long', title: 'A longer product title' })]

  it.each(['grid', 'list'] as const)('uses equal-height tracks and stretched cards in %s layout', (layout) => {
    const { container } = render(<ProductGrid products={products} layout={layout} />)
    const list = screen.getByRole('list')

    expect(list.className).toContain('auto-rows-fr')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    for (const item of container.querySelectorAll('li')) {
      expect(item.className).toContain('h-full')
    }
  })
})
