import { describe, expect, it } from 'vitest'
import { validateSleepSpots } from '../../sim/daily/Sleep'
import { FLOOR_A2 } from '../floors/floorA2'
import { MOODLETS } from '../moodlets'
import { SLEEP_SPOTS } from './sleepSpots'

const ENTRIES = Object.values(SLEEP_SPOTS)

describe('каталог мест для сна', () => {
  it('проходит проверку симуляции', () => {
    expect(validateSleepSpots(SLEEP_SPOTS)).toEqual([])
  })

  it('на построенном этаже есть где лечь', () => {
    // Иначе день в игре нельзя закончить иначе как отрубившись в два ночи.
    const kinds = new Set(FLOOR_A2.props.map((prop) => prop.kind))
    expect(ENTRIES.some((spot) => kinds.has(spot.propKind ?? ''))).toBe(true)
  })

  it('кровать в общаге уже описана и лучше всего остального', () => {
    // Требование задачи: когда появится общага, кровать должна заработать
    // без правок в симуляции — значит, она уже здесь.
    const bed = SLEEP_SPOTS.bed
    expect(bed).toBeDefined()
    for (const spot of ENTRIES) {
      if (spot.id === 'bed') continue
      expect(spot.energyQuality, spot.id).toBeLessThan(bed?.energyQuality ?? 0)
    }
  })

  it('ночь вне кровати чем-то платит', () => {
    for (const spot of ENTRIES) {
      if (spot.id === 'bed') continue
      expect(spot.moodletId, spot.id).not.toBeNull()
      expect(MOODLETS[spot.moodletId ?? '']?.mood ?? 0, spot.id).toBeLessThan(0)
    }
  })

  it('каждый модификатор из каталога существует', () => {
    for (const spot of ENTRIES) {
      if (spot.moodletId === null) continue
      expect(MOODLETS[spot.moodletId], spot.id).toBeDefined()
    }
  })

  it('подписи — готовые русские фразы', () => {
    for (const spot of ENTRIES) {
      expect(spot.label, spot.id).toMatch(/[А-Яа-яЁё]/)
      expect(spot.actionLabel, spot.id).toMatch(/[А-Яа-яЁё]/)
      // Фраза «где спали» вставляется в середину предложения, поэтому
      // начинается со строчной и с предлога.
      expect(spot.where[0], spot.id).toBe(spot.where[0]?.toLowerCase())
    }
  })

  it('ни одно место не помечено вынужденным: их выбирают', () => {
    for (const spot of ENTRIES) expect(spot.forced, spot.id).toBe(false)
  })
})
