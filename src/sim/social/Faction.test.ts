import { describe, expect, it } from 'vitest'
import {
  affinity,
  affinityBonus,
  clampFaction,
  factionLabel,
  factionMeaning,
} from './Faction'

describe('шкала традиций', () => {
  it('зажимает значение', () => {
    expect(clampFaction(-500)).toBe(-100)
    expect(clampFaction(500)).toBe(100)
    expect(clampFaction(30)).toBe(30)
  })

  it('подписывает позицию по-русски', () => {
    expect(factionLabel(-90)).toContain('налит')
    expect(factionLabel(90)).toContain('онтинент')
    expect(factionLabel(0)).toContain('е определил')
  })
})

describe('близость к преподавателю', () => {
  it('полное совпадение даёт единицу', () => {
    expect(affinity(60, 40, 60)).toBeCloseTo(1, 5)
  })

  it('на границе допуска близость нулевая', () => {
    expect(affinity(60, 40, 20)).toBeCloseTo(0, 5)
    expect(affinity(60, 40, 100)).toBeCloseTo(0, 5)
  })

  it('за пределами допуска близость отрицательная', () => {
    expect(affinity(60, 40, -100)).toBeLessThan(0)
  })

  it('никогда не опускается ниже минус единицы', () => {
    expect(affinity(100, 10, -100)).toBeGreaterThanOrEqual(-1)
  })

  it('широкий допуск прощает расхождение', () => {
    const tolerant = affinity(0, 100, 60)
    const strict = affinity(0, 20, 60)
    expect(tolerant).toBeGreaterThan(strict)
  })

  it('множитель к уважению растёт вместе с близостью', () => {
    expect(affinityBonus(1)).toBeGreaterThan(affinityBonus(0))
    expect(affinityBonus(0)).toBeGreaterThan(affinityBonus(-1))
    expect(affinityBonus(-1)).toBeGreaterThan(0)
  })
})

describe('трактовка позиции', () => {
  it('у каждой точки шкалы есть трактовка', () => {
    for (let value = -100; value <= 100; value += 5) {
      expect(factionMeaning(value).length, String(value)).toBeGreaterThan(40)
    }
  })

  it('полюса трактуются по-разному', () => {
    expect(factionMeaning(-100)).not.toBe(factionMeaning(100))
    expect(factionMeaning(0)).not.toBe(factionMeaning(100))
  })

  it('это рассказ о человеке, а не подпись шкалы', () => {
    expect(factionMeaning(-100)).not.toBe(factionLabel(-100))
    expect(factionMeaning(0)).toMatch(/[А-Яа-яЁё]/)
  })
})
