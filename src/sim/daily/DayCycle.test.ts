import { describe, expect, it } from 'vitest'
import { MINUTES_PER_DAY } from '../time/GameClock'
import {
  CURFEW_MINUTES,
  isPastCurfew,
  livingDay,
  minutesUntilCurfew,
  minutesUntilMorning,
  morningDay,
  WAKE_MINUTES,
} from './DayCycle'

describe('границы игровых суток', () => {
  it('день идёт с семи утра до двух ночи', () => {
    expect(WAKE_MINUTES).toBe(7 * 60)
    expect(CURFEW_MINUTES).toBe(2 * 60)
  })
})

describe('прожитый день', () => {
  it('днём совпадает с календарным', () => {
    expect(livingDay(3, 12 * 60)).toBe(3)
    expect(livingDay(3, WAKE_MINUTES)).toBe(3)
  })

  it('ночь принадлежит вчерашнему дню', () => {
    // Час ночи вторника — это ещё понедельник: тот, кто сидит над эссе,
    // не начал новый день, а не закончил прошлый.
    expect(livingDay(3, 60)).toBe(2)
    expect(livingDay(3, CURFEW_MINUTES)).toBe(2)
  })

  it('первая минута утра уже принадлежит новому дню', () => {
    expect(livingDay(3, WAKE_MINUTES - 1)).toBe(2)
    expect(livingDay(3, WAKE_MINUTES)).toBe(3)
  })
})

describe('сколько до утра', () => {
  it('вечером — через полночь', () => {
    expect(minutesUntilMorning(23 * 60)).toBe(8 * 60)
    expect(minutesUntilMorning(22 * 60 + 30)).toBe(8 * 60 + 30)
  })

  it('ночью — до того же утра', () => {
    expect(minutesUntilMorning(60)).toBe(6 * 60)
    expect(minutesUntilMorning(CURFEW_MINUTES)).toBe(5 * 60)
  })

  it('никогда не превышает суток', () => {
    for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += 7) {
      const left = minutesUntilMorning(minutes)
      expect(left, String(minutes)).toBeGreaterThan(0)
      expect(left, String(minutes)).toBeLessThanOrEqual(MINUTES_PER_DAY)
    }
  })

  it('приводит ровно к семи утра', () => {
    for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += 13) {
      const arrival = (minutes + minutesUntilMorning(minutes)) % MINUTES_PER_DAY
      expect(arrival, String(minutes)).toBe(WAKE_MINUTES)
    }
  })

  it('знает, в каком календарном дне окажется утро', () => {
    expect(morningDay(4, 23 * 60)).toBe(5)
    expect(morningDay(4, 60)).toBe(4)
  })
})

describe('отбой', () => {
  it('в два ночи персонаж уже спит', () => {
    expect(isPastCurfew(CURFEW_MINUTES)).toBe(true)
    expect(isPastCurfew(CURFEW_MINUTES - 1)).toBe(false)
  })

  it('к семи утра отбой кончается', () => {
    expect(isPastCurfew(WAKE_MINUTES - 1)).toBe(true)
    expect(isPastCurfew(WAKE_MINUTES)).toBe(false)
  })

  it('вечером до отбоя ещё далеко', () => {
    expect(isPastCurfew(23 * 60)).toBe(false)
    expect(minutesUntilCurfew(23 * 60)).toBe(3 * 60)
  })

  it('после полуночи остаток считается до двух', () => {
    expect(minutesUntilCurfew(60)).toBe(60)
    expect(minutesUntilCurfew(0)).toBe(CURFEW_MINUTES)
  })

  it('во время отбоя ждать больше нечего', () => {
    expect(minutesUntilCurfew(3 * 60)).toBe(0)
    expect(minutesUntilCurfew(CURFEW_MINUTES)).toBe(0)
  })
})
