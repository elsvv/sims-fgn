import { describe, expect, it } from 'vitest'
import {
  RomanceForbiddenError,
  RomanceTracker,
  canRomance,
  validateProfiles,
} from '../../sim/social/Romance'
import { PERSON_PROFILES } from './personProfiles'
import { TEACHERS } from './teachers'

describe('каталог персонажей', () => {
  it('собран без нарушений', () => {
    expect(validateProfiles(PERSON_PROFILES)).toEqual([])
  })

  it('ключ совпадает с идентификатором', () => {
    for (const [key, profile] of Object.entries(PERSON_PROFILES)) {
      expect(profile.id, key).toBe(key)
    }
  })

  it('все шестеро преподавателей на месте', () => {
    for (const teacher of Object.values(TEACHERS)) {
      const profile = PERSON_PROFILES[teacher.id]
      expect(profile, teacher.id).toBeDefined()
      expect(profile?.kind, teacher.id).toBe('teacher')
      expect(profile?.name, teacher.id).toBe(teacher.name)
    }
  })
})

describe('романтические линии в каталоге', () => {
  it('ни у одного преподавателя романтической линии нет', () => {
    for (const profile of Object.values(PERSON_PROFILES)) {
      if (profile.kind !== 'teacher') continue
      expect(profile.romanceable, profile.id).toBe(false)
      expect(profile.fictional, profile.id).toBe(false)
      expect(canRomance(profile), profile.id).toBe(false)
    }
  })

  it('романтическая линия есть только у вымышленных однокурсников', () => {
    const allowed = Object.values(PERSON_PROFILES).filter(canRomance)
    expect(allowed.length).toBeGreaterThan(0)
    for (const profile of allowed) {
      expect(profile.kind, profile.id).toBe('classmate')
      expect(profile.fictional, profile.id).toBe(true)
    }
  })

  it('однокурсник без явного разрешения тоже недоступен', () => {
    expect(canRomance(PERSON_PROFILES['marta'])).toBe(false)
  })

  it('попытка завести романтику с преподавателем падает с внятной ошибкой', () => {
    const tracker = new RomanceTracker(PERSON_PROFILES)
    for (const teacher of Object.values(TEACHERS)) {
      expect(() => tracker.advance(teacher.id, 5, 90), teacher.id).toThrow(RomanceForbiddenError)
      expect(() => tracker.advance(teacher.id, 5, 90), teacher.id).toThrow(
        /преподаватель, реальный человек под настоящим именем/,
      )
    }
  })

  it('с однокурсницей механика работает', () => {
    const tracker = new RomanceTracker(PERSON_PROFILES)
    tracker.advance('vera', 12, 40)
    expect(tracker.levelOf('vera')).toBe('spark')
    expect(tracker.describeFor('vera')).toBe('Искра')
  })
})
