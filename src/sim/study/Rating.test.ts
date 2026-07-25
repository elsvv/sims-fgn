import { describe, expect, it } from 'vitest'
import { rankAmong, ratingLabel } from './Rating'

const COHORT = [9, 8, 7, 6, 5, 4, 3, 2]

describe('место в рейтинге', () => {
  it('лучший балл даёт первое место', () => {
    const place = rankAmong(10, COHORT)
    expect(place.place).toBe(1)
    expect(place.percentile).toBe(100)
  })

  it('худший балл даёт последнее место', () => {
    const place = rankAmong(0, COHORT)
    expect(place.place).toBe(COHORT.length + 1)
    expect(place.percentile).toBe(0)
  })

  it('поток считается вместе с игроком', () => {
    expect(rankAmong(5, COHORT).cohortSize).toBe(COHORT.length + 1)
  })

  it('равный балл толкуется в пользу игрока', () => {
    // Спорный случай — не повод лишний раз тревожить: тех, кто ровно
    // на том же балле, игра ставит ниже.
    expect(rankAmong(7, COHORT).place).toBe(3)
  })

  it('лучший балл даёт место не хуже, чем худший', () => {
    expect(rankAmong(9, COHORT).place).toBeLessThan(rankAmong(3, COHORT).place)
  })

  it('поток из одного человека не делит на ноль', () => {
    const place = rankAmong(6, [])
    expect(place.place).toBe(1)
    expect(place.cohortSize).toBe(1)
    expect(place.percentile).toBe(100)
  })

  it('несёт средний балл с собой', () => {
    expect(rankAmong(6.4, COHORT).gpa).toBe(6.4)
  })
})

describe('место словами', () => {
  it('называет положение так, как о нём говорят вслух', () => {
    expect(ratingLabel(95)).toBe('вершина списка')
    expect(ratingLabel(70)).toBe('верхняя треть потока')
    expect(ratingLabel(50)).toBe('середина потока')
    expect(ratingLabel(20)).toBe('нижняя треть потока')
    expect(ratingLabel(2)).toBe('самый низ списка')
  })

  it('каждому месту находится название', () => {
    for (let percentile = 0; percentile <= 100; percentile++) {
      expect(ratingLabel(percentile).length, String(percentile)).toBeGreaterThan(0)
    }
  })
})
