import { describe, expect, it } from 'vitest'
import { createRelationship } from './Relationship'
import {
  advanceRomance,
  assertProfileSane,
  canRomance,
  RomanceForbiddenError,
  RomanceTracker,
  romanceCeiling,
  romanceLabel,
  romanceLevel,
  romanceForbiddenReason,
  validateProfiles,
  withRomance,
  type PersonProfile,
} from './Romance'

const TEACHER: PersonProfile = {
  id: 'marey',
  name: 'Марей Александр Владимирович',
  kind: 'teacher',
  fictional: false,
  romanceable: false,
}

const CLASSMATE: PersonProfile = {
  id: 'vera',
  name: 'Вера Соломина',
  kind: 'classmate',
  fictional: true,
  romanceable: true,
}

const SHY_CLASSMATE: PersonProfile = {
  id: 'kirill',
  name: 'Кирилл Ждан',
  kind: 'classmate',
  fictional: true,
  romanceable: false,
}

const PROFILES: Record<string, PersonProfile> = {
  marey: TEACHER,
  vera: CLASSMATE,
  kirill: SHY_CLASSMATE,
}

describe('кому вообще положена романтическая линия', () => {
  it('вымышленной однокурснице — да', () => {
    expect(canRomance(CLASSMATE)).toBe(true)
  })

  it('преподавателю — никогда', () => {
    expect(canRomance(TEACHER)).toBe(false)
    expect(canRomance({ ...TEACHER, romanceable: true })).toBe(false)
    expect(canRomance({ ...TEACHER, fictional: true, romanceable: true })).toBe(false)
  })

  it('однокурснику без явного разрешения — нет', () => {
    expect(canRomance(SHY_CLASSMATE)).toBe(false)
  })

  it('персонажу, списанному с живого человека, — нет', () => {
    expect(canRomance({ ...CLASSMATE, fictional: false })).toBe(false)
  })

  it('неизвестному персонажу — нет', () => {
    expect(canRomance(undefined)).toBe(false)
  })
})

describe('внятность отказа', () => {
  it('про преподавателя сказано, что он реальный человек', () => {
    const reason = romanceForbiddenReason(TEACHER)
    expect(reason).toContain('Марей Александр Владимирович')
    expect(reason).toContain('преподаватель, реальный человек под настоящим именем')
  })

  it('про невыдуманного однокурсника — что он списан с живого человека', () => {
    expect(romanceForbiddenReason({ ...CLASSMATE, fictional: false })).toContain('не выдуман')
  })

  it('про однокурсника без разрешения — что не выставлено свойство', () => {
    expect(romanceForbiddenReason(SHY_CLASSMATE)).toContain('romanceable')
  })
})

describe('проверка каталога персонажей', () => {
  it('честный каталог проходит', () => {
    expect(validateProfiles(PROFILES)).toEqual([])
  })

  it('преподаватель с романтической линией — ошибка каталога', () => {
    const problems = validateProfiles({ ...PROFILES, marey: { ...TEACHER, romanceable: true } })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('преподаватель')
  })

  it('ключ каталога обязан совпадать с идентификатором', () => {
    expect(validateProfiles({ someoneElse: CLASSMATE })[0]).toContain('не совпадает')
  })

  it('assertProfileSane падает именно на преподавателе', () => {
    expect(() => assertProfileSane(TEACHER)).not.toThrow()
    expect(() => assertProfileSane({ ...TEACHER, romanceable: true })).toThrow(
      RomanceForbiddenError,
    )
    expect(() => assertProfileSane(CLASSMATE)).not.toThrow()
  })
})

describe('уровни романтического интереса', () => {
  it('четыре ступени с русскими названиями', () => {
    expect(romanceLevel(0)).toBe('none')
    expect(romanceLevel(9)).toBe('none')
    expect(romanceLevel(10)).toBe('spark')
    expect(romanceLevel(34)).toBe('spark')
    expect(romanceLevel(35)).toBe('flirt')
    expect(romanceLevel(64)).toBe('flirt')
    expect(romanceLevel(65)).toBe('infatuation')
    expect(romanceLabel(40)).toBe('Флирт')
    expect(romanceLabel(0)).toBe('Ничего нет')
  })

  it('потолок задаётся накопленной симпатией', () => {
    expect(romanceCeiling(0)).toBe(9)
    expect(romanceCeiling(20)).toBe(34)
    expect(romanceCeiling(40)).toBe(64)
    expect(romanceCeiling(80)).toBe(100)
  })
})

describe('рост романтического интереса', () => {
  it('растёт от особых реплик', () => {
    const step = advanceRomance(0, 8, 30)
    expect(step.value).toBe(8)
    expect(step.level).toBe('none')
    expect(step.capped).toBe(false)
  })

  it('упирается в потолок, пока не накоплена симпатия', () => {
    const step = advanceRomance(30, 20, 20)
    expect(step.value).toBe(34)
    expect(step.capped).toBe(true)
    expect(step.note).toContain('накопленная симпатия')
  })

  it('с накопленной симпатией потолок отступает', () => {
    expect(advanceRomance(30, 20, 40).value).toBe(50)
  })

  it('падает свободно и не уходит ниже нуля', () => {
    const step = advanceRomance(10, -30, 80)
    expect(step.value).toBe(0)
    expect(step.capped).toBe(false)
  })

  it('выше сотни не поднимается', () => {
    expect(advanceRomance(95, 20, 90).value).toBe(100)
  })

  it('уже накопленное не отбирает, даже если симпатия просела', () => {
    expect(advanceRomance(50, 5, 0).value).toBe(50)
  })
})

describe('третье измерение поверх отношений', () => {
  it('добавляется к симпатии и уважению, не заменяя их', () => {
    const relationship = { ...createRelationship(), affection: 30, respect: 10 }
    expect(withRomance(relationship, 20)).toEqual({ affection: 30, respect: 10, romance: 20 })
  })

  it('романтическое измерение не бывает отрицательным', () => {
    expect(withRomance(createRelationship(), -5).romance).toBe(0)
  })
})

describe('учёт романтического интереса по персонажам', () => {
  it('растит интерес к однокурснице', () => {
    const tracker = new RomanceTracker(PROFILES)
    tracker.advance('vera', 12, 30)
    expect(tracker.interestIn('vera')).toBe(12)
    expect(tracker.levelOf('vera')).toBe('spark')
    expect(tracker.describeFor('vera')).toBe('Искра')
  })

  it('падает с внятной ошибкой на преподавателе', () => {
    const tracker = new RomanceTracker(PROFILES)
    expect(() => tracker.advance('marey', 5, 90)).toThrow(RomanceForbiddenError)
    expect(() => tracker.advance('marey', 5, 90)).toThrow(/преподаватель, реальный человек/)
    expect(tracker.interestIn('marey')).toBe(0)
  })

  it('падает и на однокурснике без разрешения', () => {
    const tracker = new RomanceTracker(PROFILES)
    expect(() => tracker.advance('kirill', 5, 90)).toThrow(RomanceForbiddenError)
  })

  it('не заводится на каталоге, где преподавателю разрешена романтика', () => {
    expect(() => new RomanceTracker({ ...PROFILES, marey: { ...TEACHER, romanceable: true } })).toThrow(
      /преподаватель/,
    )
  })

  it('неизвестного персонажа не выдумывает', () => {
    const tracker = new RomanceTracker(PROFILES)
    expect(() => tracker.advance('никто', 5, 90)).toThrow(/отсутствует в каталоге/)
  })

  it('ошибка помнит, к кому относится', () => {
    const tracker = new RomanceTracker(PROFILES)
    try {
      tracker.advance('marey', 1, 90)
      expect.unreachable('романтика с преподавателем должна падать')
    } catch (error) {
      expect(error).toBeInstanceOf(RomanceForbiddenError)
      expect((error as RomanceForbiddenError).personId).toBe('marey')
    }
  })

  it('сохраняется и восстанавливается', () => {
    const tracker = new RomanceTracker(PROFILES)
    tracker.advance('vera', 20, 40)
    const restored = RomanceTracker.fromJSON(PROFILES, tracker.toJSON())
    expect(restored.interestIn('vera')).toBe(20)
    expect(restored.allows('vera')).toBe(true)
    expect(restored.allows('marey')).toBe(false)
  })

  it('профиль персонажа доступен наружу', () => {
    const tracker = new RomanceTracker(PROFILES)
    expect(tracker.profileOf('marey')?.kind).toBe('teacher')
    expect(tracker.profileOf('никто')).toBeUndefined()
  })
})
