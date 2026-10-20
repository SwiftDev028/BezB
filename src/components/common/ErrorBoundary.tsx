import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Ошибка интерфейса:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center bg-ink px-6 text-center">
        <div>
          <h1 className="text-4xl text-white">Что-то пошло не так</h1>
          <p className="mt-3 text-silver">Попробуйте обновить страницу.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 bg-red px-6 py-3 font-semibold text-white hover:bg-red-hot"
          >
            Обновить
          </button>
        </div>
      </div>
    )
  }
}
