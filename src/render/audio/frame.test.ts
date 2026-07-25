import { describe, expect, it } from 'vitest'
import { SLEEP_SPOTS } from '../../content/daily/sleepSpots'
import { WEEKEND_OPTIONS } from '../../content/daily/weekendOptions'
import { DIALOGUE_CHAINS } from '../../content/dialogue/chains'
import { DIALOGUE_NODES } from '../../content/dialogue/nodes'
import { EPILOGUE_ENDINGS } from '../../content/epilogue/endings'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../../content/floors/floorA2'
import { MOODLETS } from '../../content/moodlets'
import { TEACHER_NPCS } from '../../content/people/npcs'
import { TEACHERS } from '../../content/people/teachers'
import { PROP_CATALOG } from '../../content/props/propCatalog'
import { COHORT_GPA } from '../../content/study/cohort'
import { STUDY_CONFIG } from '../../content/study/courses'
import type { ConsequenceChange } from '../../sim/dialogue/Consequences'
import { StudyState } from '../../sim/study/StudyState'
import type { Vec2 } from '../../sim/types'
import { World, type ActiveInteraction } from '../../sim/World'
import { ambienceFor } from './ambience'
import {
  ambienceSituationOf,
  audioFrameOf,
  inConversation,
  inLesson,
  interactionOf,
  lineOf,
  musicSituationOf,
  toneOfChanges,
} from './frame'
import { musicMoodFor } from './music'

/**
 * Перевод снимка мира на язык звука — на настоящем мире, а не на
 * выдуманном снимке. Здесь ловится расхождение между тем, что
 * симуляция сообщает, и тем, что звуковой слой ожидает услышать:
 * переименованное поле снимка иначе даст молчание, а не ошибку.
 */
function createWorld(): World {
  return new World(
    FLOOR_A2,
    FLOOR_A2_SPAWN,
    PROP_CATALOG,
    new StudyState(STUDY_CONFIG),
    MOODLETS,
    TEACHER_NPCS,
    { teachers: TEACHERS, dialogues: DIALOGUE_NODES, chains: DIALOGUE_CHAINS },
    {
      sleepSpots: SLEEP_SPOTS,
      weekendOptions: WEEKEND_OPTIONS,
      epilogueRules: EPILOGUE_ENDINGS,
      cohort: COHORT_GPA,
    },
  )
}

function positionsOf(world: World): ReadonlyMap<string, Vec2> {
  const map = new Map<string, Vec2>()
  for (const prop of world.plan.props) {
    map.set(prop.id, world.grid.gridToWorld({ col: prop.col, row: prop.row }))
  }
  return map
}

const CHANGE = (direction: ConsequenceChange['direction']): ConsequenceChange => ({
  dimension: 'respect',
  label: 'Уважение',
  delta: direction === 'up' ? 5 : -5,
  direction,
  magnitude: 'noticeable',
  text: 'Уважение заметно выросло',
  marker: '↑',
})

describe('снимок мира глазами звука', () => {
  it('в начале игры персонаж стоит в коридоре и молчит', () => {
    const world = createWorld()
    const frame = audioFrameOf(world.snapshot(), world.activeInteraction, positionsOf(world))
    expect(frame.moving).toBe(false)
    expect(frame.interaction).toBeNull()
    expect(frame.line).toBeNull()
    expect(frame.speech).toBeNull()
    expect(world.snapshot().currentRoom).toBe('коридор')
  })

  it('коридор из настоящей планировки опознаётся атмосферой', () => {
    // Связка снимок → слой целиком: помещение приходит из мира, слой
    // выбирается по нему, и оба конца должны сойтись.
    const world = createWorld()
    expect(ambienceFor(ambienceSituationOf(world.snapshot()))).toBe('corridor')
  })

  it('настроение музыки берётся из настоящего расписания', () => {
    const world = createWorld()
    const snapshot = world.snapshot()
    const mood = musicMoodFor(musicSituationOf(snapshot, 'study'))
    expect(['day', 'lesson', 'night']).toContain(mood)
  })

  it('положение предмета берётся из планировки, а не выдумывается', () => {
    const world = createWorld()
    const positions = positionsOf(world)
    const interaction: ActiveInteraction = {
      propId: 'coffee-1',
      interactionId: 'drinkCoffee',
      label: 'Взять кофе',
      remainingMinutes: 3,
      needDelta: {},
      skills: [],
      essayMinutes: 0,
      moodletId: null,
      sleepSpotKind: null,
    }
    const audio = interactionOf(interaction, false, positions)
    expect(audio).not.toBeNull()
    // Кофейный автомат стоит в клетке 12,6 — центр клетки в метрах.
    expect(audio?.at).toEqual({ x: 12.5, z: 6.5 })
    expect(audio?.key).toBe('coffee-1|drinkCoffee')
    expect(audio?.working).toBe(true)
  })

  it('пока персонаж идёт, действие ещё не работает', () => {
    const world = createWorld()
    const interaction: ActiveInteraction = {
      propId: 'toilet-1',
      interactionId: 'relieve',
      label: 'Сходить',
      remainingMinutes: 4,
      needDelta: {},
      skills: [],
      essayMinutes: 0,
      moodletId: null,
      sleepSpotKind: null,
    }
    expect(interactionOf(interaction, true, positionsOf(world))?.working).toBe(false)
  })

  it('предмет, которого нет на этаже, не звучит ниоткуда', () => {
    const interaction: ActiveInteraction = {
      propId: 'нет-такого',
      interactionId: 'drinkCoffee',
      label: '',
      remainingMinutes: 1,
      needDelta: {},
      skills: [],
      essayMinutes: 0,
      moodletId: null,
      sleepSpotKind: null,
    }
    expect(interactionOf(interaction, false, new Map())).toBeNull()
    expect(interactionOf(null, false, new Map())).toBeNull()
  })

  it('идущая сцена приглушает фон, пустой экран — нет', () => {
    const world = createWorld()
    expect(inConversation(world.snapshot())).toBe(false)
  })

  it('игрок не на паре, пока не вошёл в нужную аудиторию', () => {
    const world = createWorld()
    // На старте он в коридоре: даже если пара идёт, она идёт без него.
    expect(inLesson(world.snapshot())).toBe(false)
  })
})

describe('тон реплики', () => {
  it('испорченное сильнее улучшенного', () => {
    // Разговор, в котором уважение выросло, а симпатия рухнула,
    // звучит недовольством — так его и слышит собеседник.
    expect(toneOfChanges([CHANGE('up'), CHANGE('down')])).toBe('cold')
  })

  it('только рост — это тепло', () => {
    expect(toneOfChanges([CHANGE('up')])).toBe('warm')
  })

  it('ничего не изменилось — ровный тон', () => {
    expect(toneOfChanges([])).toBe('plain')
    expect(toneOfChanges([CHANGE('flat')])).toBe('plain')
  })
})

describe('реплика на экране', () => {
  it('без разговора реплики нет', () => {
    const world = createWorld()
    expect(lineOf(world.snapshot())).toBeNull()
  })

  it('вопрос и ответ одного узла — две разные реплики', () => {
    // Голос обязан прозвучать дважды: сначала на реплике собеседника,
    // потом на его реакции. Ключи для этого и различаются.
    const world = createWorld()
    const snapshot = world.snapshot()
    const prompt = lineOf({
      ...snapshot,
      activeDialogue: {
        nodeId: 'greeting',
        npcId: 'teacher-marey',
        speakerId: 'marey',
        prompt: 'Здравствуйте.',
        options: [],
        reply: null,
      },
    })
    const reply = lineOf({
      ...snapshot,
      activeDialogue: {
        nodeId: 'greeting',
        npcId: 'teacher-marey',
        speakerId: 'marey',
        prompt: 'Здравствуйте.',
        options: [],
        reply: 'Ну здравствуйте.',
      },
    })
    expect(prompt?.text).toBe('Здравствуйте.')
    expect(reply?.text).toBe('Ну здравствуйте.')
    expect(prompt?.key).not.toBe(reply?.key)
  })

  it('сцена сильнее короткого обмена', () => {
    // Сцена идёт после короткого обмена репликами, и верхним окном
    // должно быть то, которое ведёт разговор.
    const world = createWorld()
    const snapshot = world.snapshot()
    const line = lineOf({
      ...snapshot,
      activeDialogue: {
        nodeId: 'greeting',
        npcId: 'teacher-marey',
        speakerId: 'marey',
        prompt: 'Здравствуйте.',
        options: [],
        reply: null,
      },
      activeChain: {
        chainId: 'restroom',
        npcId: 'teacher-marey',
        speakerId: 'marey',
        intro: null,
        nodeId: 'start',
        prompt: 'Вы читали Шмитта?',
        options: [],
        awaitingContinue: false,
        reply: null,
        consequence: null,
        outcome: null,
      },
    })
    expect(line?.text).toBe('Вы читали Шмитта?')
  })

  it('реакция на выбор звучит тоном последствий', () => {
    const world = createWorld()
    const snapshot = world.snapshot()
    const line = lineOf({
      ...snapshot,
      activeChain: {
        chainId: 'restroom',
        npcId: 'teacher-marey',
        speakerId: 'marey',
        intro: null,
        nodeId: 'start',
        prompt: null,
        options: [],
        awaitingContinue: true,
        reply: 'Вот как.',
        consequence: { reason: 'Резко', text: 'Резко', changes: [CHANGE('down')] },
        outcome: null,
      },
    })
    expect(line?.tone).toBe('cold')
    expect(line?.text).toBe('Вот как.')
  })
})
