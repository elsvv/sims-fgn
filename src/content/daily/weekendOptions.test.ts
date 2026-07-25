import { describe, expect, it } from 'vitest'
import { MIN_WEEKEND_OPTIONS, validateWeekendOptions } from '../../sim/daily/Weekend'
import { NEED_IDS } from '../../sim/needs/needs'
import { MOODLETS } from '../moodlets'
import { WEEKEND_OPTIONS } from './weekendOptions'

describe('карточка воскресенья', () => {
  it('проходит проверку симуляции', () => {
    expect(validateWeekendOptions(WEEKEND_OPTIONS)).toEqual([])
  })

  it('вариантов не меньше четырёх', () => {
    expect(WEEKEND_OPTIONS.length).toBeGreaterThanOrEqual(MIN_WEEKEND_OPTIONS)
  })

  it('дизайн-документ назвал их поимённо, и все они здесь', () => {
    // §3: «читал / бухал / работал / отсыпался / поехал домой».
    const ids = WEEKEND_OPTIONS.map((option) => option.id)
    expect(ids).toContain('read')
    expect(ids).toContain('sleep')
    expect(ids).toContain('essay')
    expect(ids).toContain('bar')
    expect(ids).toContain('walk')
  })

  it('у каждого варианта свои последствия', () => {
    // Пять строчек с одинаковыми числами — это выбор без выбора,
    // и заметить такое глазами труднее, чем кажется.
    const fingerprints = WEEKEND_OPTIONS.map((option) =>
      NEED_IDS.map((id) => option.needDelta[id] ?? 0).join(':'),
    )
    expect(new Set(fingerprints).size).toBe(WEEKEND_OPTIONS.length)
  })

  it('каждый выходной чем-то платит за то, что даёт', () => {
    for (const option of WEEKEND_OPTIONS) {
      const values = NEED_IDS.map((id) => option.needDelta[id] ?? 0)
      expect(values.some((value) => value > 0) || (option.skills?.length ?? 0) > 0, option.id).toBe(
        true,
      )
      expect(values.some((value) => value < 0), option.id).toBe(true)
    }
  })

  it('рассказ о выходном — это рассказ, а не подпись', () => {
    for (const option of WEEKEND_OPTIONS) {
      expect(option.outcome.length, option.id).toBeGreaterThan(80)
      expect(option.description.length, option.id).toBeGreaterThan(20)
    }
  })

  it('модификаторы существуют в каталоге', () => {
    for (const option of WEEKEND_OPTIONS) {
      if (!option.moodletId) continue
      expect(MOODLETS[option.moodletId], option.id).toBeDefined()
    }
  })

  it('текст на русском и без служебных пометок', () => {
    for (const option of WEEKEND_OPTIONS) {
      for (const [field, value] of Object.entries({
        title: option.title,
        description: option.description,
        outcome: option.outcome,
      })) {
        expect(value, `${option.id}.${field}`).toMatch(/[А-Яа-яЁё]/)
        expect(value, `${option.id}.${field}`).not.toMatch(/\[[^\]]*\]/)
      }
    }
  })

  it('над эссе работает ровно один вариант: это отдельное решение', () => {
    const working = WEEKEND_OPTIONS.filter((option) => (option.essayMinutes ?? 0) > 0)
    expect(working).toHaveLength(1)
    expect(working[0]?.id).toBe('essay')
  })
})
