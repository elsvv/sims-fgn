import { describe, expect, it } from 'vitest'
import type { PersonProfile } from '../social/Romance'
import type { DialogueContext } from './Dialogue'
import {
  assertValidChain,
  availableChainOptions,
  chainEndings,
  Conversation,
  validateChain,
  type ChainNode,
  type ChainOption,
  type DialogueChainData,
} from './DialogueChain'

const CONTEXT: DialogueContext = {
  skills: { greek: 6, writing: 3 },
  faction: 20,
  relationship: { affection: 0, respect: 0 },
  readBooks: [],
  day: 4,
}

function option(overrides: Partial<ChainOption> & { id: string; next: string }): ChainOption {
  return {
    text: 'Что-нибудь сказать',
    tone: 'direct',
    effects: {},
    reply: 'Понятно.',
    consequence: 'Ничего особенного не произошло.',
    ...overrides,
  }
}

function node(overrides: Partial<ChainNode> & { id: string }): ChainNode {
  return {
    speakerId: 'npc',
    prompt: 'И что же?',
    options: [],
    ...overrides,
  }
}

/** Маленькая цепочка на два шага и две концовки. */
function makeChain(): DialogueChainData {
  return {
    id: 'проба',
    speakerId: 'npc',
    intro: 'Вы столкнулись в коридоре.',
    startId: 'start',
    nodes: [
      node({
        id: 'start',
        options: [
          option({
            id: 'plain',
            text: 'Сказать прямо',
            effects: { respect: 8 },
            consequence: 'Он оценил, что вы не стали юлить.',
            reply: 'Хорошо.',
            next: 'middle',
          }),
          option({
            id: 'learned',
            text: 'Сослаться на греческий',
            tone: 'scholarly',
            requires: { skillId: 'greek', skillMin: 5 },
            effects: { respect: 12, skill: { id: 'greek', amount: 1 } },
            consequence: 'Он услышал в вас читающего человека.',
            reply: 'Так.',
            next: 'middle',
          }),
          option({
            id: 'locked',
            text: 'Возразить по существу',
            requires: { respectMin: 90 },
            effects: {},
            consequence: 'Ничего.',
            reply: 'Смело.',
            next: 'middle',
          }),
        ],
      }),
      node({
        id: 'middle',
        prompt: 'Продолжайте.',
        options: [
          option({
            id: 'hold',
            text: 'Держаться',
            effects: { affection: -4, respect: 6 },
            consequence: 'Вы не отступили.',
            reply: 'Ну что ж.',
            next: 'good',
          }),
          option({
            id: 'fold',
            text: 'Сдаться',
            tone: 'cautious',
            effects: { affection: -6, respect: -8 },
            consequence: 'Вы дали задний ход.',
            reply: 'Идите.',
            next: 'bad',
          }),
        ],
      }),
      node({
        id: 'good',
        prompt: 'До встречи на семинаре.',
        ending: { id: 'respected', title: 'Ничья', summary: 'Он вас запомнил.' },
      }),
      node({
        id: 'bad',
        prompt: 'Идите уже.',
        ending: { id: 'shame', title: 'Отступление', summary: 'Он вас не запомнил.' },
      }),
    ],
  }
}

describe('проверка цепочки', () => {
  it('правильная цепочка не даёт ни одной жалобы', () => {
    expect(validateChain(makeChain())).toEqual([])
  })

  it('ловит ссылку в никуда', () => {
    const chain = makeChain()
    chain.nodes[1]!.options[0]!.next = 'нет-такого'
    const kinds = validateChain(chain).map((problem) => problem.kind)
    expect(kinds).toContain('broken-link')
  })

  it('ловит отсутствующий стартовый узел', () => {
    const chain = makeChain()
    chain.startId = 'нет-такого'
    expect(validateChain(chain).map((p) => p.kind)).toContain('missing-start')
  })

  it('ловит недостижимый узел', () => {
    const chain = makeChain()
    chain.nodes.push(
      node({
        id: 'сирота',
        ending: { id: 'orphan', title: 'Никогда', summary: 'Сюда не попасть.' },
      }),
    )
    const problem = validateChain(chain).find((item) => item.kind === 'unreachable')
    expect(problem?.nodeId).toBe('сирота')
  })

  it('ловит цикл', () => {
    const chain = makeChain()
    chain.nodes[1]!.options[0]!.next = 'start'
    expect(validateChain(chain).map((p) => p.kind)).toContain('cycle')
  })

  it('ловит узел без единого безусловного ответа', () => {
    const chain = makeChain()
    chain.nodes[0]!.options[0]!.requires = { skillId: 'writing', skillMin: 9 }
    const problem = validateChain(chain).find((item) => item.kind === 'no-free-option')
    expect(problem?.nodeId).toBe('start')
    expect(problem?.message).toContain('пустым меню')
  })

  it('ловит узел, из которого некуда идти', () => {
    const chain = makeChain()
    chain.nodes[1]!.options = []
    expect(validateChain(chain).map((p) => p.kind)).toContain('dead-end')
  })

  it('ловит концовку без названия', () => {
    const chain = makeChain()
    chain.nodes[2]!.ending = { id: 'respected', title: '  ', summary: 'Он вас запомнил.' }
    expect(validateChain(chain).map((p) => p.kind)).toContain('empty-ending')
  })

  it('ловит конечный узел, в котором всё ещё можно ответить', () => {
    const chain = makeChain()
    chain.nodes[2]!.options = [option({ id: 'ещё', next: 'bad' })]
    expect(validateChain(chain).map((p) => p.kind)).toContain('ending-with-options')
  })

  it('ловит повторяющиеся идентификаторы', () => {
    const chain = makeChain()
    chain.nodes.push(node({ id: 'start' }))
    expect(validateChain(chain).map((p) => p.kind)).toContain('duplicate-node')

    const twins = makeChain()
    twins.nodes[1]!.options.push(option({ id: 'hold', next: 'bad' }))
    expect(validateChain(twins).map((p) => p.kind)).toContain('duplicate-option')
  })

  it('ловит разговор, который невозможно закончить', () => {
    const chain: DialogueChainData = {
      id: 'бесконечный',
      speakerId: 'npc',
      startId: 'start',
      nodes: [node({ id: 'start', options: [option({ id: 'again', next: 'start' })] })],
    }
    const kinds = validateChain(chain).map((p) => p.kind)
    expect(kinds).toContain('cycle')
    expect(kinds).toContain('no-endings')
  })

  it('assertValidChain падает с перечнем проблем по-русски', () => {
    const chain = makeChain()
    chain.nodes[1]!.options[0]!.next = 'нет-такого'
    expect(() => assertValidChain(chain)).toThrow(/ведёт в несуществующий узел/)
  })

  it('assertValidChain молчит, когда всё в порядке', () => {
    expect(() => assertValidChain(makeChain())).not.toThrow()
  })
})

describe('романтика в цепочке', () => {
  const teacher: PersonProfile = {
    id: 'marey',
    name: 'Марей Александр Владимирович',
    kind: 'teacher',
    fictional: false,
    romanceable: false,
  }
  const classmate: PersonProfile = {
    id: 'vera',
    name: 'Вера Соломина',
    kind: 'classmate',
    fictional: true,
    romanceable: true,
  }

  function withRomanticOption(): DialogueChainData {
    const chain = makeChain()
    chain.nodes[1]!.options[0]!.effects = { romance: 6 }
    return chain
  }

  it('романтический эффект у преподавателя — ошибка контента', () => {
    const problem = validateChain(withRomanticOption(), { speaker: teacher }).find(
      (item) => item.kind === 'romance-forbidden',
    )
    expect(problem?.message).toContain('преподаватель, реальный человек')
  })

  it('у вымышленной однокурсницы тот же эффект допустим', () => {
    expect(validateChain(withRomanticOption(), { speaker: classmate })).toEqual([])
  })

  it('без романтических эффектов преподаватель претензий не вызывает', () => {
    expect(validateChain(makeChain(), { speaker: teacher })).toEqual([])
  })
})

describe('доступные реплики узла', () => {
  it('отсекает те, чьи условия не выполнены', () => {
    const start = makeChain().nodes[0]!
    expect(availableChainOptions(start, CONTEXT).map((item) => item.id)).toEqual([
      'plain',
      'learned',
    ])
  })

  it('без навыков остаётся безусловная реплика', () => {
    const start = makeChain().nodes[0]!
    const novice: DialogueContext = { ...CONTEXT, skills: {} }
    expect(availableChainOptions(start, novice).map((item) => item.id)).toEqual(['plain'])
  })
})

describe('ход разговора', () => {
  it('начинается со стартового узла и завязки', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    expect(talk.intro).toBe('Вы столкнулись в коридоре.')
    expect(talk.started).toBe(false)
    expect(talk.start().id).toBe('start')
    expect(talk.started).toBe(true)
    expect(talk.currentNode().prompt).toBe('И что же?')
  })

  it('дважды не начинается', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    expect(() => talk.start()).toThrow(/уже начат/)
  })

  it('до начала текущего узла нет', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    expect(() => talk.currentNode()).toThrow(/ещё не начат/)
  })

  it('выбор ответа даёт реплику собеседника и следующий узел', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    const step = talk.choose('plain')
    expect(step.reply).toBe('Хорошо.')
    expect(step.node?.id).toBe('middle')
    expect(step.outcome).toBeUndefined()
    expect(step.consequence.text).toBe(
      'Он оценил, что вы не стали юлить. Уважение заметно выросло.',
    )
  })

  it('копит эффекты и помнит выбранное', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    talk.choose('learned')
    talk.choose('hold')
    const state = talk.state()
    expect(state.chosen).toEqual(['learned', 'hold'])
    expect(state.totals.respect).toBe(18)
    expect(state.totals.affection).toBe(-4)
    expect(state.totals.skills).toEqual({ greek: 1 })
    expect(state.finished).toBe(true)
    expect(state.endingId).toBe('respected')
  })

  it('на конечном узле выдаёт итог вместо следующего узла', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    talk.choose('plain')
    const step = talk.choose('fold')
    expect(step.node).toBeUndefined()
    expect(step.outcome?.ending.title).toBe('Отступление')
    expect(step.outcome?.finalLine).toBe('Идите уже.')
    expect(step.outcome?.path).toEqual(['plain', 'fold'])
    expect(step.outcome?.report.closing).toContain('В сумме')
    expect(talk.finished).toBe(true)
    expect(talk.outcome()?.ending.id).toBe('shame')
  })

  it('после конца разговора выбирать нечего', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    talk.choose('plain')
    talk.choose('hold')
    expect(() => talk.currentNode()).toThrow(/уже закончен/)
    expect(() => talk.choose('fold')).toThrow(/уже закончен/)
  })

  it('чужую реплику выбрать нельзя', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    expect(() => talk.choose('hold')).toThrow(/нет реплики/)
  })

  it('недоступную реплику выбрать нельзя', () => {
    const talk = new Conversation(makeChain(), CONTEXT)
    talk.start()
    expect(() => talk.choose('locked')).toThrow(/недоступна/)
  })

  it('битую цепочку не начинает вовсе', () => {
    const chain = makeChain()
    chain.nodes[1]!.options[0]!.next = 'нет-такого'
    expect(() => new Conversation(chain, CONTEXT)).toThrow(/собрана неверно/)
  })

  it('разные ветки приводят к разным концовкам', () => {
    const first = new Conversation(makeChain(), CONTEXT)
    first.start()
    first.choose('plain')
    const good = first.choose('hold').outcome

    const second = new Conversation(makeChain(), CONTEXT)
    second.start()
    second.choose('plain')
    const bad = second.choose('fold').outcome

    expect(good?.ending.id).not.toBe(bad?.ending.id)
    expect(good?.totals.respect).toBeGreaterThan(bad?.totals.respect ?? 0)
  })

  it('список концовок собирается из цепочки', () => {
    expect(chainEndings(makeChain()).map((ending) => ending.title)).toEqual([
      'Ничья',
      'Отступление',
    ])
  })
})
