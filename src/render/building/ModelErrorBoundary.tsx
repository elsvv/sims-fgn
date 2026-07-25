import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Ловушка ошибок загрузки моделей.
 *
 * Нужна ровно за тем, что игра не должна падать из-за ассета. Файл может
 * не доехать по сети, оказаться битым, не тем или просто исчезнуть при
 * сборке — и любой из этих случаев внутри React означает исключение
 * посреди отрисовки, то есть чёрный экран вместо игры.
 *
 * Ловушка обязана быть классом: другого способа перехватить ошибку
 * отрисовки в React нет.
 */
export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    // Сообщение в консоль, а не молчание: предмет подменился боксом,
    // и человек, который это заметит, должен узнать причину.
    console.error('Модель предмета не загрузилась, рисуется бокс:', error)
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
