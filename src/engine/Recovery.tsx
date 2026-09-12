import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
export class Recovery extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message }
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {}
  render() {
    return this.state.error ? (
      <main className="error-screen">
        <h1>Не удалось открыть материал</h1>
        <p role="alert">{this.state.error}</p>
        <p>Сохранённые в браузере данные остаются на устройстве.</p>
        <button onClick={() => location.reload()}>Повторить загрузку</button>
        <button
          onClick={() => {
            const u = new URL(location.href)
            u.search = ''
            location.href = u.href
          }}
        >
          Вернуться в каталог
        </button>
      </main>
    ) : (
      this.props.children
    )
  }
}
