import { describe, expect, it } from 'vitest'
import { validateCheckout } from './checkout'

describe('проверка формы оформления', () => {
  it('принимает корректные данные', () => {
    expect(validateCheckout('Иван', 'ivan@example.com', true)).toEqual({})
  })

  it('находит все ошибки', () => {
    const errors = validateCheckout('', 'не-email', false)
    expect(errors.name).toBeDefined()
    expect(errors.email).toBeDefined()
    expect(errors.agree).toBeDefined()
  })

  it('требует email', () => {
    expect(validateCheckout('Иван', '  ', true).email).toBeDefined()
  })
})
