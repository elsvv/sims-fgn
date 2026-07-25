import type { Needs } from '../needs/needs'

/** Действие, которое можно совершить с предметом. */
export interface Interaction {
  id: string
  /** Подпись в меню, на русском. */
  label: string
  /** Сколько игровых минут занимает. */
  durationMinutes: number
  /** Как меняются нужды по завершении. */
  needDelta: Partial<Needs>
  /**
   * Идентификатор модификатора настроения, который навешивается по завершении.
   * Ссылка, а не сам модификатор: тексты живут в каталоге контента,
   * и sim о нём ничего не знает.
   */
  moodletId?: string
}

/** Габариты предмета в метрах. */
export interface PropSize {
  w: number
  d: number
  h: number
}

export interface PropDefinition {
  kind: string
  /** Подпись в интерфейсе, на русском. */
  label: string
  size: PropSize
  /** Основной цвет в формате CSS hex. */
  color: string
  /** Делает ли предмет свою клетку непроходимой. */
  blocks: boolean
  /** Что можно сделать. Пустой список — предмет декоративный. */
  interactions: Interaction[]
}

export type PropCatalog = Record<string, PropDefinition>
