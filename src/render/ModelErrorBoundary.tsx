import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: ReactNode
  /** Что подменилось, для сообщения в консоль: «предмет», «человек». */
  what?: string
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
 *
 * Ловушка одна на обстановку и на людей: причина у них общая — файл, —
 * и запасной путь устроен одинаково. Разница только в том, чем
 * подменяется: у предмета это цветной бокс, у человека — капсульный
 * человечек, который до появления моделей и рисовал всех.
 */
export class ModelErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    // Сообщение в консоль, а не молчание: на экране осталась запасная
    // геометрия, и человек, который это заметит, должен узнать причину.
    console.error(
      `Модель (${this.props.what ?? 'предмет'}) не загрузилась, рисуется запасная геометрия:`,
      error,
    )
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
