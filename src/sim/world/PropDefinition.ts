import type { Needs } from '../needs/needs'
import type { SkillId } from '../player/Skills'

/** Насколько действие поднимает навык. */
export interface InteractionSkillGain {
  id: SkillId
  amount: number
}

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
   * Что действие даёт навыкам. Нет списка — не даёт ничего.
   *
   * Ровно то же поле есть у карточки воскресенья (sim/daily/Weekend.ts),
   * и это не совпадение: окно между парами — такое же потраченное время,
   * что и выходной. Пока навык умел расти только по воскресеньям, все окна
   * модуля вместе стоили меньше одного воскресенья, и заниматься в них
   * было нечем — см. пункт 4 списка проблем.
   */
  skills?: readonly InteractionSkillGain[]
  /**
   * Сколько игровых минут работы уходит в ближайшее несданное эссе.
   * Ноль или отсутствие — действие, не имеющее к тексту отношения.
   */
  essayMinutes?: number
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
