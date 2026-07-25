import { describe, expect, it } from 'vitest'
import type { DialogueContext, DialogueNode } from '../dialogue/Dialogue'
import { openDialogue, resolveEffects, respectMultiplier } from './Conversation'
import { affinityBonus } from './Faction'
import type { Teacher } from './Teacher'

function makeTeacher(position: number, tolerance: number): Teacher {
  return {
    id: 'test',
    short: 'Тестов',
    name: 'Тестов Тест Тестович',
    courseIds: [],
    factionPosition: position,
    factionTolerance: tolerance,
    lines: {
      greeting: [],
      praise: [],
      rebuke: [],
      lateArrival: [],
      examPass: [],
      examFail: [],
    },
  }
}

/** Континентальный полюс: Михайловский. */
const CONTINENTAL = makeTeacher(85, 45)
/** Аналитический полюс: Долгоруков. */
const ANALYTIC = makeTeacher(-85, 50)

const CONTEXT: DialogueContext = {
  skills: { logic: 5 },
  faction: 0,
  relationship: { affection: 0, respect: 0 },
  readBooks: [],
  moodlets: [],
  visitedNodes: [],
  day: 1,
}

const NODE: DialogueNode = {
  id: 'test',
  speakerId: 'test',
  prompt: 'И?',
  options: [
    { id: 'safe', text: 'Промолчать', effects: {}, reply: 'Понятно.' },
    {
      id: 'smart',
      text: 'Возразить по существу',
      requires: { skillId: 'logic', skillMin: 4 },
      effects: { respect: 10 },
      reply: 'Уже лучше.',
    },
    {
      id: 'locked',
      text: 'Сослаться на прочитанное',
      requires: { book: 'phaedo' },
      effects: { respect: 12 },
      reply: 'Читали, вижу.',
    },
  ],
}

describe('начало разговора', () => {
  it('запоминает собеседника и узел', () => {
    const dialogue = openDialogue('teacher-test', NODE, CONTEXT)
    expect(dialogue.npcId).toBe('teacher-test')
    expect(dialogue.node.id).toBe('test')
  })

  it('оставляет только доступные реплики', () => {
    const dialogue = openDialogue('teacher-test', NODE, CONTEXT)
    expect(dialogue.options.map((option) => option.id)).toEqual(['safe', 'smart'])
  })

  it('начинается без ответа собеседника', () => {
    expect(openDialogue('teacher-test', NODE, CONTEXT).reply).toBeNull()
  })

  it('у неподготовленного игрока остаётся хотя бы безусловная реплика', () => {
    const empty: DialogueContext = { ...CONTEXT, skills: {} }
    expect(openDialogue('teacher-test', NODE, empty).options.map((o) => o.id)).toEqual(['safe'])
  })
})

describe('множитель уважения от близости взглядов', () => {
  it('своему достаётся больше, чем чужому', () => {
    expect(respectMultiplier(CONTINENTAL, 85)).toBeGreaterThan(respectMultiplier(CONTINENTAL, 0))
    expect(respectMultiplier(CONTINENTAL, 0)).toBeGreaterThan(respectMultiplier(CONTINENTAL, -85))
  })

  it('два полюса зеркальны: приблизившись к одному, отдаляешься от другого', () => {
    expect(respectMultiplier(CONTINENTAL, 85)).toBeCloseTo(respectMultiplier(ANALYTIC, -85), 6)
    expect(respectMultiplier(CONTINENTAL, -85)).toBeCloseTo(respectMultiplier(ANALYTIC, 85), 6)
  })

  it('даже полный чужак получает хоть что-то', () => {
    expect(respectMultiplier(CONTINENTAL, -100)).toBeGreaterThan(0)
  })

  it('совпадение позиции даёт максимум шкалы', () => {
    expect(respectMultiplier(CONTINENTAL, 85)).toBeCloseTo(affinityBonus(1), 6)
  })

  it('собеседник без позиции на шкале считается без множителя', () => {
    expect(respectMultiplier(undefined, 40)).toBe(1)
  })
})

describe('разбор эффектов реплики', () => {
  it('прирост уважения умножается на близость взглядов', () => {
    expect(resolveEffects({ respect: 10 }, 1.5).respect).toBeCloseTo(15, 6)
    expect(resolveEffects({ respect: 10 }, 0.25).respect).toBeCloseTo(2.5, 6)
  })

  it('потеря уважения идёт в полном размере у всех', () => {
    expect(resolveEffects({ respect: -10 }, 1.5).respect).toBe(-10)
    expect(resolveEffects({ respect: -10 }, 0.25).respect).toBe(-10)
  })

  it('симпатия и шкала традиций множителю не подчиняются', () => {
    const gains = resolveEffects({ affection: 6, faction: -8 }, 1.5)
    expect(gains.affection).toBe(6)
    expect(gains.faction).toBe(-8)
  })

  it('незаполненные эффекты считаются нулями', () => {
    expect(resolveEffects({}, 1.2)).toEqual({
      respect: 0,
      affection: 0,
      faction: 0,
      skill: null,
    })
  })

  it('прирост навыка передаётся копией, а не ссылкой на данные каталога', () => {
    const effects = { skill: { id: 'logic', amount: 0.4 } }
    const gains = resolveEffects(effects, 1)
    expect(gains.skill).toEqual({ id: 'logic', amount: 0.4 })
    expect(gains.skill).not.toBe(effects.skill)
  })
})
