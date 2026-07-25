import { describe, expect, it } from 'vitest'
import { asSpeed, formatClock, GameClock, GAME_MINUTES_PER_REAL_SECOND } from './GameClock'

describe('GameClock', () => {
  it('стартует в день 0 в 07:00', () => {
    expect(new GameClock().time).toEqual({ day: 0, minutes: 7 * 60 })
  })

  it('на паузе время не идёт', () => {
    const clock = new GameClock()
    clock.speed = 0
    expect(clock.advance(10)).toBe(0)
    expect(clock.time.minutes).toBe(7 * 60)
  })

  it('на скорости 1x за реальную секунду проходит GAME_MINUTES_PER_REAL_SECOND игровых минут', () => {
    const clock = new GameClock()
    clock.speed = 1
    expect(clock.advance(1)).toBeCloseTo(GAME_MINUTES_PER_REAL_SECOND, 5)
  })

  it('на скорости 3x время идёт втрое быстрее', () => {
    const clock = new GameClock()
    clock.speed = 3
    expect(clock.advance(1)).toBeCloseTo(GAME_MINUTES_PER_REAL_SECOND * 3, 5)
  })

  it('перекатывает сутки', () => {
    const clock = new GameClock(0, 23 * 60)
    clock.speed = 1
    clock.advance((2 * 60) / GAME_MINUTES_PER_REAL_SECOND)
    expect(clock.time.day).toBe(1)
    expect(clock.time.minutes).toBeCloseTo(60, 5)
  })

  it('форматирует время как ЧЧ:ММ', () => {
    expect(new GameClock(0, 7 * 60).formatTime()).toBe('07:00')
    expect(new GameClock(0, 9 * 60 + 5).formatTime()).toBe('09:05')
    expect(new GameClock(0, 23 * 60 + 59).formatTime()).toBe('23:59')
  })

  it('форматирует день как «Неделя N, день недели»', () => {
    expect(new GameClock(0, 0).formatDay()).toBe('Неделя 1, понедельник')
    expect(new GameClock(4, 0).formatDay()).toBe('Неделя 1, пятница')
    expect(new GameClock(7, 0).formatDay()).toBe('Неделя 2, понедельник')
  })

  it('totalMinutes растёт монотонно через границу суток', () => {
    const clock = new GameClock(0, 1439)
    const before = clock.totalMinutes
    clock.speed = 1
    clock.advance(10)
    expect(clock.totalMinutes).toBeGreaterThan(before)
  })
})

describe('formatClock', () => {
  it('печатает минуты суток как ЧЧ:ММ', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(7 * 60)).toBe('07:00')
    expect(formatClock(23 * 60 + 59)).toBe('23:59')
  })

  it('дробные минуты не порождают дробных цифр на часах', () => {
    expect(formatClock(9 * 60 + 5.7)).toBe('09:05')
  })
})

describe('перевод часов вперёд', () => {
  it('переводит на указанное число минут', () => {
    const clock = new GameClock(0, 23 * 60)
    clock.jump(8 * 60)
    expect(clock.time).toEqual({ day: 1, minutes: 7 * 60 })
  })

  it('работает и на паузе: игрок лёг спать, а не остановил игру', () => {
    const clock = new GameClock(0, 23 * 60)
    clock.speed = 0
    clock.jump(60)
    expect(clock.time).toEqual({ day: 1, minutes: 0 })
  })

  it('назад часы не идут', () => {
    const clock = new GameClock(2, 600)
    const before = clock.totalMinutes
    clock.jump(-500)
    clock.jump(0)
    expect(clock.totalMinutes).toBe(before)
  })
})

describe('часы в сохранении', () => {
  it('снимок и загрузка возвращают то же время и ту же скорость', () => {
    const clock = new GameClock(3, 14 * 60 + 25)
    clock.speed = 2

    const restored = GameClock.fromJSON(JSON.parse(JSON.stringify(clock.toJSON())))
    expect(restored.totalMinutes).toBe(clock.totalMinutes)
    expect(restored.time).toEqual({ day: 3, minutes: 14 * 60 + 25 })
    expect(restored.speed).toBe(2)
  })

  it('загрузка — единственный случай, когда часы идут назад', () => {
    // Всё остальное в мире считает время монотонным, поэтому jump назад
    // не идёт. Но загрузка сохранения — не движение времени, а замена мира.
    const clock = new GameClock(5, 600)
    clock.load({ totalMinutes: 60, speed: 1 })
    expect(clock.time).toEqual({ day: 0, minutes: 60 })
  })

  it('скорость из файла приводится к допустимой', () => {
    const clock = new GameClock()
    clock.load({ totalMinutes: 0, speed: asSpeed(7) })
    expect(clock.speed).toBe(0)

    expect(asSpeed(0)).toBe(0)
    expect(asSpeed(1)).toBe(1)
    expect(asSpeed(3)).toBe(3)
    expect(asSpeed(2.4)).toBe(2)
    expect(asSpeed(-1)).toBe(0)
    expect(asSpeed(Number.NaN)).toBe(0)
  })
})
