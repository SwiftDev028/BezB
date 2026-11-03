// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ProductArt } from './ProductArt'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ProductArt image loading', () => {
  it('uses a fixed image area and selects object-fit without stretching images', () => {
    const { container } = render(<ProductArt category="ai" type="subscription" imageUrl="landscape.png" />)
    const imageArea = container.querySelector('.aspect-video')
    const image = container.querySelector('img')!

    expect(imageArea).toBeTruthy()
    expect(image.className).toContain('size-full')
    expect(image.className).toContain('object-contain')

    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 900 },
    })
    fireEvent.load(image)

    expect(image.className).toContain('object-cover')
    expect(image.className).not.toContain('object-contain')
  })

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
