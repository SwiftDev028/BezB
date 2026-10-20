import { useCallback, useEffect, useState } from 'react'

/** Состояние, синхронизированное с localStorage. Устойчиво к ошибкам доступа и битым данным. */
export function useLocalStorage<T>(key: string, initial: T, parse: (raw: unknown) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored === null ? initial : parse(JSON.parse(stored))
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* приватный режим или переполнение — работаем без сохранения */
    }
  }, [key, value])

  const update = useCallback((updater: (prev: T) => T) => setValue(updater), [])
  return [value, update] as const
}
