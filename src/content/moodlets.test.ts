import { describe, expect, it } from 'vitest'
import { moodWeight } from '../sim/needs/Moodlets'
import { MOODLETS } from './moodlets'
import { PROP_CATALOG } from './props/propCatalog'

const ENTRIES = Object.values(MOODLETS)

describe('каталог модификаторов настроения', () => {
  it('их не меньше десяти — иначе игрок увидит одно и то же', () => {
    expect(ENTRIES.length).toBeGreaterThanOrEqual(10)
  })

  it('идентификатор совпадает с ключом каталога', () => {
    for (const [key, spec] of Object.entries(MOODLETS)) {
      expect(spec.id, key).toBe(key)
    }
  })

  it('подписи не повторяются', () => {
    const labels = ENTRIES.map((spec) => spec.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('у каждого есть длительность', () => {
    for (const spec of ENTRIES) {
      expect(spec.durationMinutes, spec.id).toBeGreaterThan(0)
    }
  })

  it('ни один не длится дольше игровых суток', () => {
    for (const spec of ENTRIES) {
      expect(spec.durationMinutes, spec.id).toBeLessThanOrEqual(1440)
    }
  })

  it('у каждого есть заметный сдвиг настроения', () => {
    for (const spec of ENTRIES) {
      expect(Math.abs(spec.mood), spec.id).toBeGreaterThanOrEqual(5)
      expect(Math.abs(spec.mood), spec.id).toBeLessThanOrEqual(50)
    }
  })

  it('есть и приятные, и неприятные', () => {
    expect(ENTRIES.filter((spec) => spec.mood > 0).length).toBeGreaterThanOrEqual(4)
    expect(ENTRIES.filter((spec) => spec.mood < 0).length).toBeGreaterThanOrEqual(4)
  })

  it('подписи — готовые русские фразы, а не заготовки', () => {
    for (const spec of ENTRIES) {
      expect(spec.label.trim(), spec.id).toBe(spec.label)
      expect(spec.label.length, spec.id).toBeGreaterThan(10)
      expect(spec.label, spec.id).toMatch(/[А-Яа-яЁё]/)
      expect(spec.label[0], spec.id).toBe(spec.label[0]?.toUpperCase())
    }
  })

  it('в подписях нет служебных пометок — они живут в комментариях', () => {
    for (const spec of ENTRIES) {
      expect(spec.label, spec.id).not.toMatch(/\[[^\]]*\]/)
      expect(spec.label, spec.id).not.toMatch(/допущение|исследование|research\//i)
    }
  })

  it('примеры из дизайн-документа на месте', () => {
    expect(MOODLETS.praisedByMikhailovsky?.label).toBe('Похвалил Михайловский')
    expect(MOODLETS.praisedByMikhailovsky?.mood).toBe(40)
    expect(MOODLETS.lateToMarey?.label).toBe('Опоздал к Марею')
    expect(MOODLETS.lateToMarey?.mood).toBe(-30)
    expect(MOODLETS.waitedForElevator?.label).toBe('Ждал лифт восемь минут')
  })

  it('вес каждого читается словами, а не числом', () => {
    // В панели настроения стояло «+40» и «−30». Числу этому не с чем
    // сравниться: шкалы настроения игрок не видит и видеть не должен.
    for (const spec of ENTRIES) {
      const weight = moodWeight(spec.mood)
      expect(weight.magnitude, spec.id).not.toBe('none')
      expect(weight.direction, spec.id).toBe(spec.mood > 0 ? 'up' : 'down')
      expect(weight.text, spec.id).not.toMatch(/\d/)
    }
  })

  it('самый тяжёлый и самый лёгкий описаны по-разному', () => {
    expect(moodWeight(MOODLETS.passedOutWhereStanding?.mood ?? 0).magnitude).toBe('strong')
    expect(moodWeight(MOODLETS.checkroomFarAway?.mood ?? 0).magnitude).toBe('slight')
  })

  it('каждое действие с предметом ссылается на существующий модификатор', () => {
    for (const definition of Object.values(PROP_CATALOG)) {
      for (const interaction of definition.interactions) {
        if (interaction.moodletId === undefined) continue
        expect(
          MOODLETS[interaction.moodletId],
          `${definition.kind}.${interaction.id} → ${interaction.moodletId}`,
        ).toBeDefined()
      }
    }
  })

  it('там, где модификатор уместен, он привязан', () => {
    const linked = Object.values(PROP_CATALOG)
      .flatMap((definition) => definition.interactions)
      .filter((interaction) => interaction.moodletId !== undefined)
      .map((interaction) => interaction.moodletId)

    expect(linked).toContain('waitedForElevator')
    expect(linked).toContain('vendingCoffee')
  })
})
