import {
  changesOf,
  type ChangeSet,
  type ConsequenceChange,
  type SkillLabels,
} from '../dialogue/Consequences'
import type { Needs } from '../needs/needs'
import type { SkillId } from '../player/Skills'

/**
 * Воскресенье.
 *
 * Дизайн-документ, раздел 3: учебная неделя шестидневная, выходной один,
 * и «воскресенье не отыгрывается в 3D: экран-карточка „что делал в выходной“
 * с несколькими вариантами, применяет эффекты и прокручивает день».
 *
 * Здесь только правила и проверки. Сами варианты — данные в src/content:
 * добавить «поехать к родителям» должно быть вопросом одной записи
 * в каталоге, а не правки симуляции.
 */

/**
 * Потолок прироста навыка за один выходной.
 *
 * Сторож против соблазна: день чтения не должен стоить больше недели пар,
 * иначе оптимальная стратегия игры — шесть будних дней проспать.
 */
export const WEEKEND_SKILL_GAIN_LIMIT = 2

/**
 * Меньше четырёх вариантов — это уже не выбор, а объявление.
 * Дизайн-документ называет пять: читать, бухать, работать, отсыпаться,
 * поехать домой.
 */
export const MIN_WEEKEND_OPTIONS = 4

export interface WeekendSkillGain {
  id: SkillId
  amount: number
}

/** Как можно провести единственный выходной. */
export interface WeekendOption {
  id: string
  /** Заголовок карточки: «Отсыпаться». */
  title: string
  /** Что это значит — строка под заголовком, читается до выбора. */
  description: string
  /** Что станет с нуждами за сутки. Это уже итог целого дня, а не часа. */
  needDelta: Partial<Needs>
  skills?: readonly WeekendSkillGain[]
  /** Сдвиг по шкале философских традиций. */
  factionShift?: number
  moodletId?: string
  /**
   * Сколько игровых минут работы уходит в ближайшее несданное эссе.
   * Ноль или отсутствие — выходной, потраченный не на текст.
   */
  essayMinutes?: number
  /** Рассказ о том, как прошёл выходной. Читается после выбора. */
  outcome: string
}

/** Чем кончился выходной: рассказ плюс то, что изменилось. */
export interface WeekendReport {
  optionId: string
  title: string
  outcome: string
  changes: ConsequenceChange[]
  /** Приписки от мира: «Эссе продвинулось». */
  notes: string[]
}

export function findWeekendOption(
  options: readonly WeekendOption[],
  id: string,
): WeekendOption | undefined {
  return options.find((option) => option.id === id)
}

/** Изменения выходного в том виде, в каком их описывают словами. */
function changeSetOf(option: WeekendOption): ChangeSet {
  const set: ChangeSet = {}
  if (option.factionShift) set.faction = option.factionShift
  // Навык в описании один: в карточке выходного их и так не больше двух,
  // а перечень «подрос, подрос, подрос» читается как накладная.
  const strongest = [...(option.skills ?? [])].sort(
    (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
  )[0]
  if (strongest) set.skill = { id: strongest.id, amount: strongest.amount }
  return set
}

/**
 * Собирает рассказ о выходном.
 *
 * Нужды в изменения нарочно не попадают: игрок и так увидит полоски,
 * а перечисление «сытость выросла, гигиена упала» превращает выходной
 * в чек из магазина.
 */
export function describeWeekend(
  option: WeekendOption,
  labels: SkillLabels = {},
  notes: readonly string[] = [],
): WeekendReport {
  return {
    optionId: option.id,
    title: option.title,
    outcome: option.outcome,
    changes: changesOf(changeSetOf(option), labels),
    notes: [...notes],
  }
}

/** Возвращает список ошибок одного варианта. Пустой список — вариант корректен. */
export function validateWeekendOption(option: WeekendOption): string[] {
  const errors: string[] = []
  const where = `Выходной «${option.id}»`

  if (option.title.trim() === '') errors.push(`${where}: нет заголовка`)
  if (option.description.trim() === '') errors.push(`${where}: не сказано, что это значит`)
  if (option.outcome.trim() === '') errors.push(`${where}: нечего прочитать после выбора`)

  if (Object.keys(option.needDelta).length === 0 && !option.skills?.length) {
    errors.push(`${where}: не меняет ничего — такой выходной нечем отличить от другого`)
  }

  for (const gain of option.skills ?? []) {
    if (Math.abs(gain.amount) > WEEKEND_SKILL_GAIN_LIMIT) {
      errors.push(
        `${where}: навык «${gain.id}» растёт на ${gain.amount} за день — это больше, чем даёт неделя занятий`,
      )
    }
  }

  if ((option.essayMinutes ?? 0) < 0) {
    errors.push(`${where}: отрицательное время работы над эссе`)
  }

  return errors
}

/**
 * Проверяет набор целиком.
 *
 * Главных требований два: вариантов не меньше четырёх и они действительно
 * разные. Карточка, где все пять строчек дают одно и то же, — это выбор
 * без выбора, и заметить такое глазами в наборе из пяти записей труднее,
 * чем кажется.
 */
export function validateWeekendOptions(options: readonly WeekendOption[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const option of options) {
    if (seen.has(option.id)) errors.push(`Выходной «${option.id}» повторяется`)
    seen.add(option.id)
    errors.push(...validateWeekendOption(option))
  }

  if (options.length > 0 && options.length < MIN_WEEKEND_OPTIONS) {
    errors.push(
      `Вариантов выходного ${options.length}, а должно быть не меньше ${MIN_WEEKEND_OPTIONS}`,
    )
  }

  const titles = new Set(options.map((option) => option.title))
  if (titles.size !== options.length) {
    errors.push('Два выходных названы одинаково')
  }

  return errors
}
