import { describe, expect, it } from 'vitest'
import { availableOptions, isAvailable, type DialogueContext, type DialogueNode } from './Dialogue'

const CONTEXT: DialogueContext = {
  skills: { greek: 6, logic: 2, german: 0, writing: 4, rhetoric: 5, stamina: 3 },
  faction: 40,
  relationship: { affection: 10, respect: 30 },
  readBooks: ['phaedo'],
  day: 12,
}

describe('условия доступности реплики', () => {
  it('пустое условие доступно всегда', () => {
    expect(isAvailable({}, CONTEXT)).toBe(true)
  })

  it('требование навыка', () => {
    expect(isAvailable({ skillId: 'greek', skillMin: 5 }, CONTEXT)).toBe(true)
    expect(isAvailable({ skillId: 'greek', skillMin: 8 }, CONTEXT)).toBe(false)
    expect(isAvailable({ skillId: 'logic', skillMin: 5 }, CONTEXT)).toBe(false)
  })

  it('неизвестный навык считается нулевым', () => {
    expect(isAvailable({ skillId: 'латынь', skillMin: 1 }, CONTEXT)).toBe(false)
  })

  it('требование позиции на шкале традиций', () => {
    expect(isAvailable({ factionMin: 20 }, CONTEXT)).toBe(true)
    expect(isAvailable({ factionMin: 60 }, CONTEXT)).toBe(false)
    expect(isAvailable({ factionMax: 50 }, CONTEXT)).toBe(true)
    expect(isAvailable({ factionMax: 10 }, CONTEXT)).toBe(false)
  })

  it('требование отношений', () => {
    expect(isAvailable({ respectMin: 25 }, CONTEXT)).toBe(true)
    expect(isAvailable({ respectMin: 50 }, CONTEXT)).toBe(false)
    expect(isAvailable({ affectionMin: 5 }, CONTEXT)).toBe(true)
    expect(isAvailable({ affectionMin: 50 }, CONTEXT)).toBe(false)
  })

  it('требование прочитанной книги', () => {
    expect(isAvailable({ book: 'phaedo' }, CONTEXT)).toBe(true)
    expect(isAvailable({ book: 'critique' }, CONTEXT)).toBe(false)
  })

  it('несколько требований складываются по И', () => {
    expect(isAvailable({ book: 'phaedo', respectMin: 25 }, CONTEXT)).toBe(true)
    expect(isAvailable({ book: 'phaedo', respectMin: 90 }, CONTEXT)).toBe(false)
  })
})

const NODE: DialogueNode = {
  id: 'test',
  speakerId: 'marey',
  prompt: 'И что же вы думаете об этом тексте?',
  options: [
    { id: 'safe', text: 'Промолчать', effects: {}, reply: 'Понятно.' },
    {
      id: 'greek',
      text: 'Сослаться на греческий оригинал',
      requires: { skillId: 'greek', skillMin: 5 },
      effects: { respect: 8 },
      reply: 'Уже лучше.',
    },
    {
      id: 'locked',
      text: 'Возразить по существу',
      requires: { respectMin: 90 },
      effects: { respect: 15 },
      reply: 'Смело.',
    },
  ],
}

describe('доступные реплики', () => {
  it('отдаёт только те, чьи условия выполнены', () => {
    expect(availableOptions(NODE, CONTEXT).map((o) => o.id)).toEqual(['safe', 'greek'])
  })

  it('реплика без условий доступна всегда', () => {
    const poor: DialogueContext = {
      ...CONTEXT,
      skills: {},
      relationship: { affection: -50, respect: -50 },
      readBooks: [],
    }
    expect(availableOptions(NODE, poor).map((o) => o.id)).toEqual(['safe'])
  })
})
