// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductArt } from './ProductArt'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProductArt image loading', () => {
  it('keeps the product label visible after an image failure and makes only one automatic retry', () => {
    vi.useFakeTimers()
    const imageUrl = 'test-image.png'
    const { container } = render(<ProductArt category="ai" type="subscription" label="ChatGPT" imageUrl={imageUrl} />)

    expect(screen.getByText('ChatGPT')).toBeTruthy()
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText(/Повторная загрузка/)).toBeTruthy()

    act(() => vi.advanceTimersByTime(800))
    const retriedImage = container.querySelector('img')
    expect(retriedImage?.getAttribute('src')).toBe(imageUrl)

    fireEvent.error(retriedImage!)
    expect(screen.getByText(/Изображение временно недоступно/)).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('ChatGPT')).toBeTruthy()
  })
})
