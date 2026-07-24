import { describe, expect, it } from 'vitest'
import {
  applyNeedDelta,
  calculateMood,
  createNeeds,
  decayNeeds,
  needSatisfaction,
  NEED_IDS,
  NEED_LABELS,
} from './needs'

describe('нужды', () => {
  it('создаются полными, стресс — нулевым', () => {
    const needs = createNeeds()
    expect(needs.energy).toBe(100)
    expect(needs.hunger).toBe(100)
    expect(needs.stress).toBe(0)
  })

  it('принимают переопределения при создании', () => {
    expect(createNeeds({ energy: 40 }).energy).toBe(40)
  })

  it('убывают со временем', () => {
    const before = createNeeds()
    const after = decayNeeds(before, 60)
    expect(after.energy).toBeLessThan(before.energy)
    expect(after.hunger).toBeLessThan(before.hunger)
  })

  it('не мутируют исходный объект', () => {
    const before = createNeeds()
    decayNeeds(before, 600)
    expect(before.energy).toBe(100)
  })

  it('стресс со временем растёт, а не убывает', () => {
    expect(decayNeeds(createNeeds(), 60).stress).toBeGreaterThan(0)
  })

  it('зажимаются в диапазон 0..100', () => {
    const drained = decayNeeds(createNeeds(), 100000)
    for (const id of NEED_IDS) {
      expect(drained[id]).toBeGreaterThanOrEqual(0)
      expect(drained[id]).toBeLessThanOrEqual(100)
    }
    expect(drained.energy).toBe(0)
    expect(drained.stress).toBe(100)
  })

  it('применяют дельту и зажимают результат', () => {
    const needs = createNeeds({ energy: 90 })
    expect(applyNeedDelta(needs, { energy: 30 }).energy).toBe(100)
    expect(applyNeedDelta(needs, { energy: -200 }).energy).toBe(0)
  })

  it('удовлетворённость стресса инвертирована', () => {
    expect(needSatisfaction('energy', 80)).toBe(80)
    expect(needSatisfaction('stress', 80)).toBe(20)
  })

  it('подпись стресса отражает инверсию', () => {
    expect(NEED_LABELS.stress).toBe('Спокойствие')
  })

  it('настроение высоко при полных нуждах и нулевом стрессе', () => {
    expect(calculateMood(createNeeds())).toBeGreaterThan(90)
  })

  it('настроение падает от голода и стресса', () => {
    expect(calculateMood(createNeeds({ hunger: 5, stress: 95, energy: 10 }))).toBeLessThan(40)
  })
})
