import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

interface ToastContextValue {
  notify: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const notify = useCallback((text: string) => {
    window.clearTimeout(timer.current)
    setMessage(text)
    timer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])

  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4"
      >
        {message && (
          <div className="clip-corner-sm pointer-events-auto flex items-center gap-2 border border-line bg-graphite px-4 py-3 text-sm font-medium text-white shadow-2xl">
            <Check className="size-4 text-red" aria-hidden="true" />
            {message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast должен использоваться внутри ToastProvider')
  return ctx
}
