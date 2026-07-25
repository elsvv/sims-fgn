import { describe, expect, it } from 'vitest'
import {
  availableOptions,
  isAvailable,
  isUnconditional,
  validateDialogueCatalog,
  validateDialogueNode,
  type DialogueContext,
  type DialogueNode,
} from './Dialogue'

const CONTEXT: DialogueContext = {
  skills: { greek: 6, logic: 2, german: 0, writing: 4, rhetoric: 5, stamina: 3 },
  faction: 40,
  relationship: { affection: 10, respect: 30 },
  readBooks: ['phaedo'],
  moodlets: [],
  visitedNodes: [],
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

describe('условия по настроению', () => {
  const PRAISED: DialogueContext = { ...CONTEXT, moodlets: ['praised', 'elevator'] }

  it('требование действующего модификатора', () => {
    expect(isAvailable({ moodletId: 'praised' }, PRAISED)).toBe(true)
    expect(isAvailable({ moodletId: 'humiliated' }, PRAISED)).toBe(false)
  })

  it('без единого модификатора такая реплика закрыта', () => {
    expect(isAvailable({ moodletId: 'praised' }, CONTEXT)).toBe(false)
  })

  it('требование отсутствия модификатора', () => {
    expect(isAvailable({ withoutMoodletId: 'elevator' }, PRAISED)).toBe(false)
    expect(isAvailable({ withoutMoodletId: 'humiliated' }, PRAISED)).toBe(true)
    expect(isAvailable({ withoutMoodletId: 'elevator' }, CONTEXT)).toBe(true)
  })

  it('наличие и отсутствие — разные условия и работают вместе', () => {
    expect(isAvailable({ moodletId: 'praised', withoutMoodletId: 'elevator' }, PRAISED)).toBe(
      false,
    )
    expect(isAvailable({ moodletId: 'praised', withoutMoodletId: 'humiliated' }, PRAISED)).toBe(
      true,
    )
  })
})

describe('условия по истории разговоров', () => {
  const REMEMBERS: DialogueContext = {
    ...CONTEXT,
    visitedNodes: ['marey-restroom-opening', 'end-brotherhood'],
  }

  it('требование пройденного узла', () => {
    expect(isAvailable({ visitedNode: 'marey-restroom-opening' }, REMEMBERS)).toBe(true)
    expect(isAvailable({ visitedNode: 'end-duel' }, REMEMBERS)).toBe(false)
  })

  it('тому, у кого этого разговора не было, реплика закрыта', () => {
    expect(isAvailable({ visitedNode: 'marey-restroom-opening' }, CONTEXT)).toBe(false)
  })

  it('память о конце разговора отличает один исход от другого', () => {
    expect(isAvailable({ visitedNode: 'end-brotherhood' }, REMEMBERS)).toBe(true)
    expect(isAvailable({ visitedNode: 'end-judgement' }, REMEMBERS)).toBe(false)
  })

  it('складывается с остальными условиями по И', () => {
    const requirement = { visitedNode: 'end-brotherhood', skillId: 'greek', skillMin: 5 }
    expect(isAvailable(requirement, REMEMBERS)).toBe(true)
    expect(isAvailable({ ...requirement, skillMin: 9 }, REMEMBERS)).toBe(false)
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
      moodlets: [],
      visitedNodes: [],
    }
    expect(availableOptions(NODE, poor).map((o) => o.id)).toEqual(['safe'])
  })
})

describe('безусловность реплики', () => {
  it('реплика без поля требований безусловна', () => {
    expect(isUnconditional({ id: 'a', text: 'Молчать', effects: {}, reply: 'Ага.' })).toBe(true)
  })

  it('пустой объект требований — тоже без условий', () => {
    expect(
      isUnconditional({ id: 'a', text: 'Молчать', requires: {}, effects: {}, reply: 'Ага.' }),
    ).toBe(true)
  })

  it('любое требование делает реплику условной', () => {
    expect(
      isUnconditional({
        id: 'a',
        text: 'Молчать',
        requires: { respectMin: 0 },
        effects: {},
        reply: 'Ага.',
      }),
    ).toBe(false)
  })
})

describe('проверка узла', () => {
  it('корректный узел не даёт ошибок', () => {
    expect(validateDialogueNode(NODE)).toEqual([])
  })

  it('ругается на узел без единой безусловной реплики', () => {
    const locked: DialogueNode = {
      ...NODE,
      options: NODE.options.filter((option) => option.requires !== undefined),
    }
    const errors = validateDialogueNode(locked)
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('безусловной')
  })

  it('узел с пустым требованием безусловной репликой считается корректным', () => {
    const node: DialogueNode = {
      ...NODE,
      options: [{ id: 'safe', text: 'Промолчать', requires: {}, effects: {}, reply: 'Понятно.' }],
    }
    expect(validateDialogueNode(node)).toEqual([])
  })

  it('ругается на узел без реплик', () => {
    const errors = validateDialogueNode({ ...NODE, options: [] })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('нет ни одной реплики')
  })

  it('ругается на повторяющиеся идентификаторы реплик', () => {
    const first = NODE.options[0]!
    const errors = validateDialogueNode({ ...NODE, options: [first, { ...first }] })
    expect(errors.some((error) => error.includes('повторяется'))).toBe(true)
  })

  it('ругается на пустые тексты', () => {
    const errors = validateDialogueNode({
      id: 'broken',
      speakerId: ' ',
      prompt: '',
      options: [{ id: 'a', text: '  ', effects: {}, reply: '' }],
    })
    expect(errors.length).toBe(4)
  })

  it('называет узел, в котором нашлась ошибка', () => {
    const errors = validateDialogueNode({ ...NODE, id: 'marey-hall', options: [] })
    expect(errors[0]).toContain('marey-hall')
  })
})

describe('проверка каталога', () => {
  it('корректный каталог не даёт ошибок', () => {
    expect(validateDialogueCatalog({ [NODE.id]: NODE })).toEqual([])
  })

  it('ругается на узел, лежащий не под своим ключом', () => {
    const errors = validateDialogueCatalog({ 'другой-ключ': NODE })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('другой-ключ')
  })

  it('собирает ошибки со всех узлов', () => {
    const broken: DialogueNode = { id: 'broken', speakerId: 'marey', prompt: 'И?', options: [] }
    const errors = validateDialogueCatalog({ [NODE.id]: NODE, broken })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('broken')
  })
})
