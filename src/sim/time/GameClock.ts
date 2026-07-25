/** Множитель скорости игры. 0 — пауза. */
export type Speed = 0 | 1 | 2 | 3

export interface GameTime {
  /** Номер игрового дня с начала модуля, начиная с 0. */
  day: number
  /** Минут с полуночи, 0..1439. */
  minutes: number
}

/** Сколько игровых минут проходит за одну реальную секунду на скорости 1x. */
export const GAME_MINUTES_PER_REAL_SECOND = 1.5

export const MINUTES_PER_DAY = 1440

const WEEKDAYS = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const

/**
 * Минуты с полуночи как «09:00».
 *
 * Живёт здесь, а не в трёх местах сразу: часами в углу экрана, сеткой
 * звонков и рассказом о прожитом дне время печатается одинаково, иначе
 * в одной игре встретится и «09:00», и «9:00».
 */
export function formatClock(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = Math.floor(minutes % 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Часы в сохранении. Хранится сама пройденная дистанция, а не день и минуты. */
export interface GameClockState {
  /** Минут с начала модуля. */
  totalMinutes: number
  speed: Speed
}

/**
 * Приводит число к допустимой скорости.
 *
 * Нужно на входе из сохранения: в файле лежит просто число, а скорость —
 * это одно из четырёх значений. Мусор превращается в паузу, а не в игру,
 * летящую с неизвестным множителем.
 */
export function asSpeed(value: number): Speed {
  const rounded = Math.round(value)
  return rounded === 1 || rounded === 2 || rounded === 3 ? rounded : 0
}

export class GameClock {
  speed: Speed = 1

  /** Минут с начала модуля. Растёт монотонно. */
  private elapsed: number

  constructor(startDay = 0, startMinutes = 7 * 60) {
    this.elapsed = startDay * MINUTES_PER_DAY + startMinutes
  }

  get totalMinutes(): number {
    return this.elapsed
  }

  get time(): GameTime {
    return {
      day: Math.floor(this.elapsed / MINUTES_PER_DAY),
      minutes: this.elapsed % MINUTES_PER_DAY,
    }
  }

  /**
   * Продвигает часы. Возвращает, сколько игровых минут прошло,
   * чтобы вызывающий код мог начислить износ нужд.
   */
  advance(realDeltaSeconds: number): number {
    if (this.speed === 0) return 0
    const gameMinutes = realDeltaSeconds * GAME_MINUTES_PER_REAL_SECOND * this.speed
    this.elapsed += gameMinutes
    return gameMinutes
  }

  /**
   * Переводит часы вперёд сразу на много минут — сон до утра, прокрученное
   * воскресенье.
   *
   * Пауза здесь не действует нарочно: игрок лёг спать, и время должно
   * перейти к утру независимо от того, на какой скорости стояла игра.
   * Назад часы не идут: попытка отмотать время игнорируется, потому что
   * весь остальной мир — сроки эссе, отметки о посещении, модификаторы —
   * считает время монотонным.
   */
  jump(gameMinutes: number): void {
    if (gameMinutes <= 0) return
    this.elapsed += gameMinutes
  }

  toJSON(): GameClockState {
    return { totalMinutes: this.elapsed, speed: this.speed }
  }

  /**
   * Ставит часы в сохранённое положение.
   *
   * Единственное место, где часам разрешено идти назад, и потому это
   * отдельный метод, а не jump: загрузка сохранения — не движение времени,
   * а замена одного мира другим.
   */
  load(state: GameClockState): void {
    this.elapsed = state.totalMinutes
    this.speed = asSpeed(state.speed)
  }

  static fromJSON(state: GameClockState): GameClock {
    const clock = new GameClock()
    clock.load(state)
    return clock
  }

  formatTime(): string {
    return formatClock(this.time.minutes)
  }

  formatDay(): string {
    const { day } = this.time
    const week = Math.floor(day / 7) + 1
    const weekday = WEEKDAYS[day % 7] ?? 'понедельник'
    return `Неделя ${week}, ${weekday}`
  }
}
