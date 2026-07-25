import { describe, expect, it } from 'vitest'
import type { DialogueContext } from '../../sim/dialogue/Dialogue'
import {
  Conversation,
  chainEndings,
  validateChain,
  type ChainNode,
  type ChainOption,
} from '../../sim/dialogue/DialogueChain'
import { emptyTotals, addChanges, type EffectTotals } from '../../sim/dialogue/Consequences'
import type { PersonProfile } from '../../sim/social/Romance'
import { MAREY_RESTROOM } from './marey-restroom'

const MAREY: PersonProfile = {
  id: 'marey',
  name: 'Марей Александр Владимирович',
  kind: 'teacher',
  fictional: false,
  romanceable: false,
}

/** Отличник: ему открыты все реплики, включая латинские. */
const SCHOLAR: DialogueContext = {
  skills: { ancientLanguages: 6, academicWriting: 5, eloquence: 4 },
  faction: 30,
  relationship: { affection: 0, respect: 0 },
  readBooks: [],
  day: 9,
}

/** Первокурсник без языков: гарантированно видит только безусловные реплики. */
const NOVICE: DialogueContext = { ...SCHOLAR, skills: {} }

const NODES = new Map(MAREY_RESTROOM.nodes.map((node) => [node.id, node]))
const BRANCHING = MAREY_RESTROOM.nodes.filter((node) => node.ending === undefined)

function nodeById(id: string): ChainNode {
  const node = NODES.get(id)
  if (!node) throw new Error(`В сцене нет узла «${id}».`)
  return node
}

interface Walk {
  options: ChainOption[]
  endingId: string
}

/** Все маршруты сцены — без учёта требований, то есть глазами автора. */
function allWalks(): Walk[] {
  const walks: Walk[] = []
  const step = (node: ChainNode, taken: ChainOption[]): void => {
    if (node.ending) {
      walks.push({ options: taken, endingId: node.ending.id })
      return
    }
    for (const option of node.options) {
      step(nodeById(option.next), [...taken, option])
    }
  }
  step(nodeById(MAREY_RESTROOM.startId), [])
  return walks
}

function totalsOf(walk: Walk): EffectTotals {
  return walk.options.reduce((totals, option) => addChanges(totals, option.effects), emptyTotals())
}

const WALKS = allWalks()

/** Проигрывает сцену по заданным репликам и отдаёт итог. */
function play(context: DialogueContext, choices: string[]) {
  const talk = new Conversation(MAREY_RESTROOM, context)
  talk.start()
  for (const choice of choices) {
    const available = talk.currentOptions().map((option) => option.id)
    expect(available, `реплика «${choice}» должна быть доступна`).toContain(choice)
    talk.choose(choice)
  }
  const outcome = talk.outcome()
  if (!outcome) throw new Error('Разговор не дошёл до концовки.')
  return outcome
}

describe('сцена «Марей в туалете»: сборка', () => {
  it('цепочка собрана без ошибок', () => {
    expect(validateChain(MAREY_RESTROOM)).toEqual([])
  })

  it('у сцены есть завязка с окликом', () => {
    expect(MAREY_RESTROOM.intro).toContain('не моете руки')
    expect(MAREY_RESTROOM.intro).toContain('Александр Владимирович')
  })

  it('разговор ведёт Марей', () => {
    expect(MAREY_RESTROOM.speakerId).toBe('marey')
    for (const node of MAREY_RESTROOM.nodes) {
      expect(node.speakerId, node.id).toBe('marey')
    }
  })
})

describe('сцена «Марей в туалете»: концовки', () => {
  it('их пять, и все с русскими названиями', () => {
    const endings = chainEndings(MAREY_RESTROOM)
    expect(endings.map((ending) => ending.id).sort()).toEqual([
      'brotherhood',
      'coursework',
      'duel',
      'judgement',
      'retreat',
    ])
    for (const ending of endings) {
      expect(ending.title.length, ending.id).toBeGreaterThan(4)
      expect(ending.summary.length, ending.id).toBeGreaterThan(40)
    }
  })

  it('названия исходов не повторяются', () => {
    const titles = chainEndings(MAREY_RESTROOM).map((ending) => ending.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('до каждой можно дойти', () => {
    const reached = new Set(WALKS.map((walk) => walk.endingId))
    expect([...reached].sort()).toEqual([
      'brotherhood',
      'coursework',
      'duel',
      'judgement',
      'retreat',
    ])
  })
})

describe('сцена «Марей в туалете»: ветвление', () => {
  it('каждый маршрут — не меньше четырёх обменов репликами', () => {
    for (const walk of WALKS) {
      expect(walk.options.length, walk.options.map((o) => o.id).join(' → ')).toBeGreaterThanOrEqual(
        4,
      )
    }
  })

  it('на каждой развилке есть все четыре тона', () => {
    for (const node of BRANCHING) {
      const tones = new Set(node.options.map((option) => option.tone))
      expect([...tones].sort(), node.id).toEqual(['bold', 'cautious', 'direct', 'scholarly'])
    }
  })

  it('без навыков на каждой развилке всё равно остаётся четыре тона', () => {
    for (const node of BRANCHING) {
      const free = node.options.filter((option) => option.requires === undefined)
      expect(new Set(free.map((option) => option.tone)).size, node.id).toBe(4)
    }
  })

  it('часть реплик открывается только знающим языки', () => {
    const gated = MAREY_RESTROOM.nodes
      .flatMap((node) => node.options)
      .filter((option) => option.requires !== undefined)
    expect(gated.length).toBeGreaterThanOrEqual(2)
    for (const option of gated) {
      expect(option.requires?.skillId, option.id).toBe('ancientLanguages')
    }
  })

  it('развилки ведут в разные стороны, а не в один и тот же узел', () => {
    for (const node of BRANCHING) {
      expect(new Set(node.options.map((option) => option.next)).size, node.id).toBeGreaterThan(1)
    }
  })

  it('одна и та же реплика не встречается дважды', () => {
    const texts = MAREY_RESTROOM.nodes.flatMap((node) => node.options.map((option) => option.text))
    expect(new Set(texts).size).toBe(texts.length)
  })
})

describe('сцена «Марей в туалете»: текст', () => {
  const options = MAREY_RESTROOM.nodes.flatMap((node) => node.options)
  const spoken = [
    MAREY_RESTROOM.intro ?? '',
    ...MAREY_RESTROOM.nodes.map((node) => node.prompt),
    ...options.flatMap((option) => [option.text, option.reply, option.consequence]),
    ...chainEndings(MAREY_RESTROOM).flatMap((ending) => [ending.title, ending.summary]),
  ]

  it('служебных пометок в репликах нет — они живут в комментариях', () => {
    for (const line of spoken) {
      expect(line).not.toMatch(/\[[^\]]*\]/)
      expect(line).not.toMatch(/допущение|research\//i)
    }
  })

  it('у каждой реплики есть человеческое описание последствий без цифр', () => {
    for (const option of options) {
      expect(option.consequence.length, option.id).toBeGreaterThan(20)
      expect(option.consequence, option.id).not.toMatch(/\d/)
      expect(option.consequence, option.id).toMatch(/[.!?…»)]$/)
    }
  })

  it('реплики игрока и ответы Марея — законченные фразы', () => {
    for (const option of options) {
      expect(option.text.trim(), option.id).toBe(option.text)
      expect(option.text.length, option.id).toBeGreaterThan(10)
      expect(option.reply.length, option.id).toBeGreaterThan(20)
    }
  })

  it('юмор идёт от контраста высокого и низкого, а не от физиологии', () => {
    const crude = /вонь|фекал|жоп|сра[тл]|блев|моч[аеиу]/i
    for (const line of spoken) {
      expect(line, line.slice(0, 40)).not.toMatch(crude)
    }
  })

  it('Марей говорит своими подтверждёнными оборотами', () => {
    const all = spoken.join('\n')
    expect(all).toContain('Возникает, как минимум, лёгкое недоумение. Как самый минимум.')
    expect(all).toContain('Нам это как раз не нужно, нам и без этого хорошо')
    expect(all).toContain('Дальше и выше!')
    expect(all).toContain('у меня своей славы хватает')
    expect(all).toContain('Овладение языком дисциплины — это условие входа в неё')
    expect(all).toContain('небольшая доля безумия')
  })

  it('он структурирует речь и цитирует на латыни', () => {
    const all = spoken.join('\n')
    expect(all).toContain('Итак. Три вещи')
    expect(all).toContain('Manus manum lavat')
    expect(all).toContain('Mundus vult decipi')
    expect(all).toContain('limpieza de sangre')
    expect(all).toContain('dignitas')
  })
})

describe('сцена «Марей в туалете»: романтики нет и быть не может', () => {
  it('ни одна реплика не двигает романтический интерес', () => {
    for (const option of MAREY_RESTROOM.nodes.flatMap((node) => node.options)) {
      expect(option.effects.romance, option.id).toBeUndefined()
    }
  })

  it('проверка с профилем преподавателя не находит нарушений', () => {
    expect(validateChain(MAREY_RESTROOM, { speaker: MAREY })).toEqual([])
  })

  it('романтическая реплика в этой сцене была бы ошибкой контента', () => {
    const tampered = structuredClone(MAREY_RESTROOM)
    tampered.nodes[0]!.options[0]!.effects = { romance: 5 }
    const problem = validateChain(tampered, { speaker: MAREY }).find(
      (item) => item.kind === 'romance-forbidden',
    )
    expect(problem?.message).toContain('преподаватель, реальный человек')
  })
})

describe('сцена «Марей в туалете»: прогоны', () => {
  it('братство по оружию: и симпатия, и уважение сильно вверх', () => {
    const outcome = play(NOVICE, [
      'opening-direct',
      'counter-direct',
      'confession-direct',
      'antiquity-direct',
    ])
    expect(outcome.ending.id).toBe('brotherhood')
    expect(outcome.totals.respect).toBeGreaterThan(20)
    expect(outcome.totals.affection).toBeGreaterThan(20)
    expect(outcome.report.closing).toContain('уважение сильно выросло')
    expect(outcome.report.closing).toContain('симпатия сильно выросла')
    expect(outcome.finalLine).toContain('Дальше и выше!')
  })

  it('осуждение: симпатия сильно вниз, уважение всё-таки вверх', () => {
    const outcome = play(NOVICE, [
      'opening-bold',
      'impudence-bold',
      'sermon-direct',
      'verdict-direct',
    ])
    expect(outcome.ending.id).toBe('judgement')
    expect(outcome.totals.affection).toBeLessThan(-20)
    expect(outcome.totals.respect).toBeGreaterThan(0)
    expect(outcome.report.closing).toContain('уважение заметно выросло')
    expect(outcome.report.closing).toContain('симпатия сильно упала')
    expect(outcome.finalLine).toContain('лёгкое недоумение')
  })

  it('учёная дуэль: уважение сильно вверх, симпатия чуть-чуть', () => {
    const outcome = play(NOVICE, [
      'opening-scholarly',
      'norm-direct',
      'duel-scholarly',
      'norma-scholarly',
    ])
    expect(outcome.ending.id).toBe('duel')
    expect(outcome.totals.respect).toBeGreaterThan(20)
    expect(outcome.report.closing).toContain('уважение сильно выросло')
    expect(outcome.report.closing).toContain('симпатия чуть заметно выросла')
  })

  it('позорное отступление: теряется и то и другое, но немного', () => {
    const outcome = play(NOVICE, [
      'opening-cautious',
      'counter-cautious',
      'mumble-cautious',
      'verdict-cautious',
    ])
    expect(outcome.ending.id).toBe('retreat')
    expect(outcome.totals.respect).toBeLessThan(0)
    expect(outcome.totals.affection).toBeLessThan(0)
    expect(outcome.report.closing).toBe(
      'В сумме: уважение заметно упало, симпатия заметно упала.',
    )
  })

  it('тема для курсовой: только знающим языки, и с прибавкой к письму', () => {
    const outcome = play(SCHOLAR, [
      'opening-scholarly',
      'norm-scholarly',
      'duel-scholarly',
      'norma-coursework',
    ])
    expect(outcome.ending.id).toBe('coursework')
    expect(outcome.totals.respect).toBeGreaterThan(20)
    expect(outcome.totals.skills).toEqual({ academicWriting: 1 })
    expect(outcome.finalLine).toContain('у меня своей славы хватает')
  })

  it('латинская ветка первокурснику без языков недоступна', () => {
    const talk = new Conversation(MAREY_RESTROOM, NOVICE)
    talk.start()
    expect(talk.currentOptions().map((option) => option.id)).not.toContain('opening-latin')
    expect(() => talk.choose('opening-latin')).toThrow(/недоступна/)
  })

  it('латиниста он выделяет сразу', () => {
    const talk = new Conversation(MAREY_RESTROOM, SCHOLAR)
    talk.start()
    expect(talk.currentOptions().map((option) => option.id)).toContain('opening-latin')
    const step = talk.choose('opening-latin')
    expect(step.reply).toContain('Петроний')
    expect(step.consequence.changes.map((change) => change.dimension)).toEqual([
      'respect',
      'affection',
    ])
    expect(step.consequence.text).toContain('Уважение сильно выросло')
  })

  it('до выбора игрок видит тон реплики, а не баллы', () => {
    const talk = new Conversation(MAREY_RESTROOM, SCHOLAR)
    talk.start()
    const preview = talk.currentPreview()
    expect(preview.map((item) => item.tone)).toEqual([
      'cautious',
      'direct',
      'bold',
      'scholarly',
      'bold',
    ])
    for (const item of preview) {
      expect(item.hint, item.id).not.toMatch(/\d/)
    }
  })

  it('после выбора игрок читает фразу, а не арифметику', () => {
    const talk = new Conversation(MAREY_RESTROOM, NOVICE)
    talk.start()
    const step = talk.choose('opening-direct')
    expect(step.consequence.reason).toBe(
      'Он оценил, что вы не стали юлить: спросили прямо и без брезгливой мины.',
    )
    expect(step.consequence.changes[0]?.marker).toBe('↑↑')
    expect(step.consequence.text).not.toMatch(/\d/)
  })

  it('одни и те же четыре шага у разных игроков дают разные концовки', () => {
    const first = play(NOVICE, ['opening-direct', 'counter-direct', 'confession-direct', 'antiquity-direct'])
    const second = play(NOVICE, ['opening-direct', 'counter-bold', 'sermon-direct', 'verdict-direct'])
    expect(first.ending.id).not.toBe(second.ending.id)
  })

  it('братство даёт максимум и по симпатии, и по уважению', () => {
    const best = (endingId: string, key: 'respect' | 'affection'): number =>
      Math.max(
        ...WALKS.filter((walk) => walk.endingId === endingId).map((walk) => totalsOf(walk)[key]),
      )

    for (const other of ['duel', 'coursework', 'judgement', 'retreat']) {
      expect(best('brotherhood', 'respect'), other).toBeGreaterThan(best(other, 'respect'))
      expect(best('brotherhood', 'affection'), other).toBeGreaterThan(best(other, 'affection'))
    }
  })

  it('осуждение симпатии не прибавляет ни на одном маршруте', () => {
    const best = Math.max(
      ...WALKS.filter((walk) => walk.endingId === 'judgement').map(
        (walk) => totalsOf(walk).affection,
      ),
    )
    expect(best).toBeLessThan(0)
  })

  it('последний шаг задаёт характер концовки', () => {
    const lastSteps = (endingId: string): ChainOption[] =>
      WALKS.filter((walk) => walk.endingId === endingId).map((walk) => walk.options[3]!)

    for (const option of lastSteps('brotherhood')) {
      expect(option.effects.affection ?? 0, option.id).toBeGreaterThan(0)
    }
    for (const option of lastSteps('duel')) {
      expect(option.effects.respect ?? 0, option.id).toBeGreaterThan(0)
    }
    for (const option of lastSteps('judgement')) {
      expect(option.effects.affection ?? 0, option.id).toBeLessThan(0)
    }
    for (const option of lastSteps('retreat')) {
      expect(option.effects.affection ?? 0, option.id).toBeLessThan(0)
      expect(option.effects.respect ?? 0, option.id).toBeLessThan(0)
    }
  })
})
