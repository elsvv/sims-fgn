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

  formatTime(): string {
    const { minutes } = this.time
    const hh = Math.floor(minutes / 60)
    const mm = Math.floor(minutes % 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  formatDay(): string {
    const { day } = this.time
    const week = Math.floor(day / 7) + 1
    const weekday = WEEKDAYS[day % 7] ?? 'понедельник'
    return `Неделя ${week}, ${weekday}`
  }
}
