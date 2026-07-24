import { describe, expect, it } from 'vitest'
import { GameClock, GAME_MINUTES_PER_REAL_SECOND } from './GameClock'

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
