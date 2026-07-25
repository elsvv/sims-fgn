import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_MOODLET,
  COLLAPSE_SPOT,
  ENERGY_PER_HOUR,
  sleepNeedDelta,
  sleepThroughNight,
  validateSleepSpot,
  validateSleepSpots,
  type SleepSpot,
} from './Sleep'

const BED: SleepSpot = {
  id: 'bed',
  propKind: 'bed',
  label: 'Своя кровать',
  where: 'в своей кровати',
  actionLabel: 'Лечь спать',
  energyQuality: 1,
  stressRelief: 0.8,
  moodletId: 'sleptWell',
  afterword: null,
  forced: false,
}

const BENCH: SleepSpot = {
  ...BED,
  id: 'bench',
  propKind: 'bench',
  label: 'Скамейка',
  where: 'на скамейке',
  energyQuality: 0.35,
  stressRelief: 0.2,
  afterword: 'Спина это запомнит.',
}

describe('что сон даёт нуждам', () => {
  it('энергия растёт пропорционально длительности', () => {
    const short = sleepNeedDelta(4 * 60, BED).energy ?? 0
    const long = sleepNeedDelta(8 * 60, BED).energy ?? 0
    expect(long).toBeCloseTo(short * 2, 5)
    expect(long).toBeCloseTo(ENERGY_PER_HOUR * 8, 5)
  })

  it('плохое место восстанавливает хуже за то же время', () => {
    const bed = sleepNeedDelta(8 * 60, BED).energy ?? 0
    const bench = sleepNeedDelta(8 * 60, BENCH).energy ?? 0
    expect(bench).toBeLessThan(bed)
    expect(bench).toBeGreaterThan(0)
  })

  it('снимает часть стресса, а не весь', () => {
    const delta = sleepNeedDelta(8 * 60, BED).stress ?? 0
    expect(delta).toBeLessThan(0)
    expect(Math.abs(delta)).toBeLessThan(100)
  })

  it('гигиену сон не поднимает — она за ночь падает', () => {
    expect(sleepNeedDelta(8 * 60, BED).hygiene ?? 0).toBeLessThan(0)
  })

  it('проснуться сытым нельзя', () => {
    const delta = sleepNeedDelta(8 * 60, BED)
    expect(delta.hunger ?? 0).toBeLessThan(0)
    expect(delta.bladder ?? 0).toBeLessThan(0)
  })

  it('во сне не скучают по людям', () => {
    const delta = sleepNeedDelta(8 * 60, BED)
    expect(delta.social).toBeUndefined()
    expect(delta.fun).toBeUndefined()
  })

  it('нулевая длительность ничего не меняет', () => {
    for (const value of Object.values(sleepNeedDelta(0, BED))) {
      expect(Math.abs(value)).toBe(0)
    }
  })
})

describe('вынужденный сон', () => {
  it('восстанавливает заметно хуже нормальной ночи', () => {
    const bed = sleepNeedDelta(5 * 60, BED).energy ?? 0
    const collapse = sleepNeedDelta(5 * 60, COLLAPSE_SPOT).energy ?? 0
    expect(collapse).toBeLessThan(bed / 2)
  })

  it('не снимает стресса вовсе: отключиться — не отдохнуть', () => {
    expect(Math.abs(sleepNeedDelta(5 * 60, COLLAPSE_SPOT).stress ?? 0)).toBe(0)
  })

  it('помечен как вынужденный и вешает свой модификатор', () => {
    expect(COLLAPSE_SPOT.forced).toBe(true)
    expect(COLLAPSE_SPOT.moodletId).toBe(COLLAPSE_MOODLET)
  })

  it('объясняет игроку, что произошло', () => {
    expect(COLLAPSE_SPOT.afterword).not.toBeNull()
  })
})

describe('ночь целиком', () => {
  it('запоминает, где и во сколько легли', () => {
    const outcome = sleepThroughNight(BENCH, 23 * 60 + 40, 7 * 60 + 20)
    expect(outcome.spotId).toBe('bench')
    expect(outcome.where).toBe('на скамейке')
    expect(outcome.bedtimeMinutes).toBe(23 * 60 + 40)
    expect(outcome.minutes).toBe(7 * 60 + 20)
    expect(outcome.forced).toBe(false)
    expect(outcome.afterword).toBe('Спина это запомнит.')
  })

  it('ничего не применяет сама — только считает', () => {
    const before = { ...BED }
    sleepThroughNight(BED, 0, 420)
    expect(BED).toEqual(before)
  })
})

describe('проверка данных', () => {
  it('корректное место проходит', () => {
    expect(validateSleepSpot(BED)).toEqual([])
    expect(validateSleepSpots({ bed: BED, bench: BENCH })).toEqual([])
  })

  it('ловит качество вне шкалы', () => {
    expect(validateSleepSpot({ ...BED, energyQuality: 1.5 })).toHaveLength(1)
    expect(validateSleepSpot({ ...BED, stressRelief: -1 })).toHaveLength(1)
  })

  it('ловит место без названия', () => {
    expect(validateSleepSpot({ ...BED, label: '  ' })).toHaveLength(1)
    expect(validateSleepSpot({ ...BED, where: '' })).toHaveLength(1)
    expect(validateSleepSpot({ ...BED, actionLabel: '' })).toHaveLength(1)
  })

  it('ловит расхождение ключа каталога с видом предмета', () => {
    // Иначе «лечь спать» на кровати молча уложило бы персонажа на скамейку.
    expect(validateSleepSpots({ sofa: BED })).toHaveLength(1)
  })

  it('вынужденный сон нельзя положить в меню предмета', () => {
    expect(validateSleepSpots({ collapse: COLLAPSE_SPOT })).not.toEqual([])
  })
})
