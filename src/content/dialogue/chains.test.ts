import { describe, expect, it } from 'vitest'
import { isMoving } from '../../sim/actor/Actor'
import { validateChain } from '../../sim/dialogue/DialogueChain'
import { npcRoom } from '../../sim/npc/Npc'
import { createSkills, isSkillId } from '../../sim/player/Skills'
import { World, type ActiveChainInfo } from '../../sim/World'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../floors/floorA2'
import { MOODLETS } from '../moodlets'
import { TEACHER_NPCS } from '../people/npcs'
import { PERSON_PROFILES } from '../people/personProfiles'
import { TEACHERS } from '../people/teachers'
import { PROP_CATALOG } from '../props/propCatalog'
import { STUDY_CONFIG } from '../study/courses'
import { StudyState } from '../../sim/study/StudyState'
import { DIALOGUE_CHAINS } from './chains'
import { MAREY_RESTROOM_HAPPENED } from './marey-restroom'
import { DIALOGUE_NODES, dialogueNodeFor } from './nodes'

const ENTRIES = Object.entries(DIALOGUE_CHAINS)

describe('каталог многошаговых сцен', () => {
  it('идентификатор совпадает с ключом каталога', () => {
    for (const [key, entry] of ENTRIES) {
      expect(entry.chain.id, key).toBe(key)
    }
  })

  it('каждая сцена собрана без ошибок и с учётом профиля собеседника', () => {
    for (const [key, entry] of ENTRIES) {
      const speaker = PERSON_PROFILES[entry.chain.speakerId]
      expect(speaker, `у сцены «${key}» неизвестный собеседник`).toBeDefined()
      expect(validateChain(entry.chain, { speaker }), key).toEqual([])
    }
  })

  it('собеседник каждой сцены живёт на этаже', () => {
    const speakers = new Set(TEACHER_NPCS.flatMap((npc) => (npc.teacherId ? [npc.teacherId] : [])))
    for (const [key, entry] of ENTRIES) {
      expect(speakers.has(entry.chain.speakerId), key).toBe(true)
    }
  })

  it('помещение сцены есть в планировке этажа', () => {
    const rooms = new Set(FLOOR_A2.rooms.map((room) => room.id))
    for (const [key, entry] of ENTRIES) {
      if (entry.room === undefined) continue
      expect(rooms.has(entry.room), `${key} → ${entry.room}`).toBe(true)
    }
  })

  it('навыки в условиях и эффектах реплик существуют', () => {
    for (const [key, entry] of ENTRIES) {
      for (const node of entry.chain.nodes) {
        for (const option of node.options) {
          const required = option.requires?.skillId
          if (required !== undefined) {
            expect(isSkillId(required), `${key}/${option.id} → ${required}`).toBe(true)
          }
          const gained = option.effects.skill?.id
          if (gained !== undefined) {
            expect(isSkillId(gained), `${key}/${option.id} → ${gained}`).toBe(true)
          }
        }
      }
    }
  })

  it('модификаторы настроения из сцен есть в каталоге', () => {
    for (const [key, entry] of ENTRIES) {
      for (const node of entry.chain.nodes) {
        const ending = node.ending?.moodletId
        if (ending !== undefined) {
          expect(MOODLETS[ending], `${key}/${node.id} → ${ending}`).toBeDefined()
        }
        for (const option of node.options) {
          const moodletId = option.effects.moodletId
          if (moodletId !== undefined) {
            expect(MOODLETS[moodletId], `${key}/${option.id} → ${moodletId}`).toBeDefined()
          }
        }
      }
    }
  })

  it('«Марей в туалете» привязана к туалетам и играется один раз', () => {
    const entry = DIALOGUE_CHAINS['marey-restroom']
    expect(entry?.room).toBe('туалеты')
    expect(entry?.once).toBe(true)
    expect(entry?.chain.speakerId).toBe('marey')
  })

  it('у каждой концовки сцены свой след в настроении', () => {
    const endings = DIALOGUE_CHAINS['marey-restroom']?.chain.nodes.flatMap((node) =>
      node.ending ? [node.ending] : [],
    )
    expect(endings?.length).toBe(5)
    for (const ending of endings ?? []) {
      expect(ending.moodletId, ending.id).toBeDefined()
    }
    expect(new Set(endings?.map((ending) => ending.moodletId)).size).toBe(5)
  })
})

/* ------------------------------------------------------------------ */
/* Память о разговорах: один общий список узлов на всю игру            */
/* ------------------------------------------------------------------ */

/** Все узлы игры: короткие разговоры и узлы всех сцен, с указанием, чьи они. */
function allNodeIds(): { id: string; where: string }[] {
  const nodes = Object.values(DIALOGUE_NODES).map((node) => ({
    id: node.id,
    where: 'короткие разговоры',
  }))
  for (const [key, entry] of ENTRIES) {
    for (const node of entry.chain.nodes) nodes.push({ id: node.id, where: key })
  }
  return nodes
}

/** Все ссылки на прошлые разговоры из условий реплик. */
function allMemoryReferences(): { nodeId: string; where: string }[] {
  const refs: { nodeId: string; where: string }[] = []
  for (const node of Object.values(DIALOGUE_NODES)) {
    for (const option of node.options) {
      const visited = option.requires?.visitedNode
      if (visited !== undefined) refs.push({ nodeId: visited, where: `${node.id}/${option.id}` })
    }
  }
  for (const [key, entry] of ENTRIES) {
    for (const node of entry.chain.nodes) {
      for (const option of node.options) {
        const visited = option.requires?.visitedNode
        if (visited !== undefined) {
          refs.push({ nodeId: visited, where: `${key}/${node.id}/${option.id}` })
        }
      }
    }
  }
  return refs
}

describe('память о прошлых разговорах', () => {
  it('идентификаторы узлов не повторяются во всей игре', () => {
    // Память — один плоский список: два разных узла под одним именем
    // означали бы, что один разговор помнится вместо другого.
    const seen = new Map<string, string>()
    for (const { id, where } of allNodeIds()) {
      const owner = seen.get(id)
      expect(owner, `узел «${id}» есть и в «${owner}», и в «${where}»`).toBeUndefined()
      seen.set(id, where)
    }
  })

  it('каждая ссылка на прошлый разговор ведёт в существующий узел', () => {
    const known = new Set(allNodeIds().map((node) => node.id))
    for (const { nodeId, where } of allMemoryReferences()) {
      expect(known.has(nodeId), `${where} ссылается на несуществующий узел «${nodeId}»`).toBe(true)
    }
  })

  it('память о прошлых разговорах вообще используется', () => {
    expect(allMemoryReferences().length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/* Сцена «Марей в туалете» целиком, через мир                          */
/* ------------------------------------------------------------------ */

/**
 * Марей ведёт НИС: вторник, третья пара, и пятница, четвёртая, — плюс
 * историю по понедельникам и пятницам. Вылазка в туалет открывается
 * за 75 минут до звонка, поэтому ждать его надо во вторник ближе к полудню.
 */
const NIS_TUESDAY = { day: 1, minutes: 12 * 60 + 20 }

/** Клетка внутри туалетов: игрок ждёт там же, где окажется Марей. */
const IN_RESTROOM = { col: 5, row: 10 }

const MAREY_NPC = 'teacher-marey'

function makeWorld(spawn = IN_RESTROOM): World {
  return new World(
    FLOOR_A2,
    spawn,
    PROP_CATALOG,
    new StudyState(STUDY_CONFIG),
    MOODLETS,
    TEACHER_NPCS,
    { teachers: TEACHERS, dialogues: DIALOGUE_NODES, chains: DIALOGUE_CHAINS },
  )
}

/**
 * Прокручивает игровое время до указанного дня и минуты суток.
 *
 * Итоги дня закрываются по дороге: после двух ночи персонаж вырубается,
 * и мир стоит, пока игрок не прочитает, как прошёл день. Прокрутка обязана
 * вести себя как игрок, иначе упрётся в первую же ночь.
 */
function runUntil(world: World, day: number, minutes: number): void {
  world.clock.speed = 3
  for (let i = 0; i < 400000; i++) {
    const now = world.clock.time
    if (now.day > day || (now.day === day && now.minutes >= minutes)) break
    world.tick(0.25)
    world.dismissDaySummary()
    world.dismissWeekendReport()
  }
  expect(world.clock.time.day).toBe(day)
  expect(world.clock.time.minutes).toBeGreaterThanOrEqual(minutes)
}

/**
 * Мир в тот момент, когда Марей стоит в туалете, а игрок ждёт его там же.
 * Дальше остаётся только заговорить.
 */
function worldAtTheEncounter(skills: Partial<Record<string, number>> = {}): World {
  const world = makeWorld()
  world.skills = createSkills(skills)
  // За полчаса до конца окна: он давно дошёл, но выйти ещё не успел.
  runUntil(world, NIS_TUESDAY.day, NIS_TUESDAY.minutes - 45)

  const marey = world.npcManager.find(MAREY_NPC)
  expect(marey).toBeDefined()
  expect(npcRoom(world.grid, marey!)).toBe('туалеты')
  expect(world.currentRoom).toBe('туалеты')
  return world
}

/** Проигрывает сцену от начала до конца и отдаёт итог. */
function play(world: World, choices: string[]): ActiveChainInfo {
  expect(world.startChainDialogue('marey-restroom')).toBe(true)

  let step: ActiveChainInfo | null = null
  for (const choice of choices) {
    const available = world
      .snapshot()
      .activeChain?.options.filter((option) => option.available)
      .map((option) => option.id)
    expect(available, `реплика «${choice}» должна быть доступна`).toContain(choice)

    step = world.chooseChainOption(choice)
    expect(step, choice).not.toBeNull()
    world.continueChainDialogue()
  }

  const outcome = world.snapshot().activeChain
  expect(outcome?.outcome, 'сцена не дошла до концовки').not.toBeNull()
  return outcome!
}

describe('«Марей в туалете»: встреча в мире', () => {
  it('перед своей парой он действительно заходит в туалет', () => {
    const world = worldAtTheEncounter()
    expect(world.availableChains()).toEqual(['marey-restroom'])
    expect(world.chainForNpc(MAREY_NPC)).toBe('marey-restroom')
  })

  it('до вылазки его в туалете нет и сцены тоже', () => {
    const world = makeWorld()
    runUntil(world, NIS_TUESDAY.day, NIS_TUESDAY.minutes - 120)

    expect(npcRoom(world.grid, world.npcManager.find(MAREY_NPC)!)).not.toBe('туалеты')
    expect(world.availableChains()).toEqual([])
    expect(world.startChainDialogue('marey-restroom')).toBe(false)
  })

  it('к звонку он уже в аудитории и на свою пару не опоздал', () => {
    const world = makeWorld()
    runUntil(world, NIS_TUESDAY.day, NIS_TUESDAY.minutes)
    expect(npcRoom(world.grid, world.npcManager.find(MAREY_NPC)!)).toBe('А-204')
    expect(world.availableChains()).toEqual([])
  })

  it('игрок успевает дойти из коридора и застать его', () => {
    // Игрок стоит там, где начинается игра, — посреди коридора.
    const world = makeWorld(FLOOR_A2_SPAWN)
    runUntil(world, NIS_TUESDAY.day, NIS_TUESDAY.minutes - 60)

    expect(world.currentRoom).toBe('коридор')
    expect(npcRoom(world.grid, world.npcManager.find(MAREY_NPC)!)).toBe('туалеты')
    // Из коридора сцены нет: они в разных помещениях.
    expect(world.startChainDialogue('marey-restroom')).toBe(false)

    // Увидел, пошёл следом — и застал.
    expect(world.commandApproachNpc(MAREY_NPC)).toBe(true)
    for (let i = 0; i < 2000 && isMoving(world.player); i++) world.tick(0.25)

    expect(world.currentRoom).toBe('туалеты')
    expect(world.chainForNpc(MAREY_NPC)).toBe('marey-restroom')
    expect(world.startChainDialogue('marey-restroom')).toBe(true)
  })

  it('сцена начинается с завязки и всех четырёх тонов', () => {
    const world = worldAtTheEncounter()
    world.startChainDialogue('marey-restroom')

    const chain = world.snapshot().activeChain
    expect(chain?.intro).toContain('не моете руки')
    expect(chain?.speakerId).toBe('marey')
    expect(new Set(chain?.options.map((option) => option.tone))).toEqual(
      new Set(['cautious', 'direct', 'bold', 'scholarly']),
    )
  })

  it('первокурснику латинская реплика видна серой, с намёком', () => {
    const world = worldAtTheEncounter()
    world.startChainDialogue('marey-restroom')

    const latin = world.snapshot().activeChain?.options.find((o) => o.id === 'opening-latin')
    expect(latin?.available).toBe(false)
    expect(latin?.lockHint).toBe('нужны древние языки')
  })

  it('знающему языки она открыта', () => {
    const world = worldAtTheEncounter({ ancientLanguages: 6 })
    world.startChainDialogue('marey-restroom')

    const latin = world.snapshot().activeChain?.options.find((o) => o.id === 'opening-latin')
    expect(latin?.available).toBe(true)
    expect(latin?.lockHint).toBeNull()
  })
})

describe('«Марей в туалете»: все пять концовок проходимы', () => {
  it('братство по оружию', () => {
    const world = worldAtTheEncounter()
    const result = play(world, [
      'opening-direct',
      'counter-direct',
      'confession-direct',
      'antiquity-direct',
    ])

    expect(result.outcome?.endingId).toBe('brotherhood')
    expect(result.outcome?.title).toBe('Братство по оружию')
    expect(result.prompt).toContain('Дальше и выше!')

    const relationship = world.relationships.get(MAREY_NPC)
    expect(relationship.respect).toBeGreaterThan(0)
    expect(relationship.affection).toBeGreaterThan(20)
    expect(world.moodlets.has('caughtMareyAtTheSink')).toBe(true)
  })

  it('осуждение', () => {
    const world = worldAtTheEncounter()
    const result = play(world, [
      'opening-bold',
      'impudence-bold',
      'sermon-direct',
      'verdict-direct',
    ])

    expect(result.outcome?.endingId).toBe('judgement')
    expect(result.prompt).toContain('лёгкое недоумение')

    const relationship = world.relationships.get(MAREY_NPC)
    expect(relationship.affection).toBeLessThan(-20)
    expect(relationship.respect).toBeGreaterThan(0)
    expect(world.moodlets.has('mildBewilderment')).toBe(true)
  })

  it('учёная дуэль', () => {
    const world = worldAtTheEncounter()
    const result = play(world, [
      'opening-scholarly',
      'norm-direct',
      'duel-scholarly',
      'norma-scholarly',
    ])

    expect(result.outcome?.endingId).toBe('duel')
    expect(result.prompt).toContain('limpieza de sangre')
    expect(world.relationships.get(MAREY_NPC).respect).toBeGreaterThan(20)
    expect(world.moodlets.has('academicDuelDrawn')).toBe(true)
  })

  it('позорное отступление', () => {
    const world = worldAtTheEncounter()
    const result = play(world, [
      'opening-cautious',
      'counter-cautious',
      'mumble-cautious',
      'verdict-cautious',
    ])

    expect(result.outcome?.endingId).toBe('retreat')

    const relationship = world.relationships.get(MAREY_NPC)
    expect(relationship.respect).toBeLessThan(0)
    expect(relationship.affection).toBeLessThan(0)
    expect(world.moodlets.has('heHeldTheDoorOpen')).toBe(true)
  })

  it('тема для курсовой — только знающему языки, и с прибавкой к письму', () => {
    const world = worldAtTheEncounter({ ancientLanguages: 6 })
    const before = world.skills.academicWriting

    const result = play(world, [
      'opening-scholarly',
      'norm-scholarly',
      'duel-scholarly',
      'norma-coursework',
    ])

    expect(result.outcome?.endingId).toBe('coursework')
    expect(result.prompt).toContain('у меня своей славы хватает')
    expect(world.skills.academicWriting).toBeGreaterThan(before)
    expect(world.relationships.get(MAREY_NPC).respect).toBeGreaterThan(20)
    expect(world.moodlets.has('courseworkFromNowhere')).toBe(true)
  })

  it('после сыгранной сцены второй раз её не предлагают', () => {
    const world = worldAtTheEncounter()
    play(world, ['opening-direct', 'counter-direct', 'confession-direct', 'antiquity-direct'])
    world.endChainDialogue()

    expect(world.playedChains).toEqual(['marey-restroom'])
    expect(world.availableChains()).toEqual([])
  })

  it('итог написан словами: ни одной цифры на экране', () => {
    const world = worldAtTheEncounter()
    const result = play(world, [
      'opening-direct',
      'counter-direct',
      'confession-direct',
      'antiquity-direct',
    ])

    expect(result.outcome?.closing).not.toMatch(/\d/)
    expect(result.outcome?.summary).not.toMatch(/\d/)
    for (const change of result.outcome?.changes ?? []) {
      expect(change.text).not.toMatch(/\d/)
      expect(change.marker).toMatch(/^[↑↓—]+$/)
    }
  })
})

describe('«Марей в туалете» помнится в следующих разговорах', () => {
  /** Реплики, открытые игроку в начатом коротком разговоре. */
  function optionsOf(world: World): string[] {
    return world.snapshot().activeDialogue?.options.map((option) => option.id) ?? []
  }

  /** Играет сцену до «братства по оружию» и закрывает окно. */
  function afterTheScene(): World {
    const world = worldAtTheEncounter()
    play(world, ['opening-direct', 'counter-direct', 'confession-direct', 'antiquity-direct'])
    world.endChainDialogue()
    return world
  }

  it('тому, кто его не окликал, вспоминать нечего', () => {
    const world = worldAtTheEncounter()
    expect(world.hasVisitedNode(MAREY_RESTROOM_HAPPENED)).toBe(false)
    expect(world.startDialogue('marey-course')).toBe(true)
    expect(optionsOf(world)).not.toContain('remember-restroom')
  })

  it('сыгранная сцена остаётся в памяти мира', () => {
    expect(afterTheScene().hasVisitedNode(MAREY_RESTROOM_HAPPENED)).toBe(true)
  })

  it('и открывает особую реплику в разговоре о курсе', () => {
    const world = afterTheScene()
    expect(world.startDialogue('marey-course')).toBe(true)
    expect(optionsOf(world)).toContain('remember-restroom')
  })

  it('после такого разговора он и так говорит с вами о деле, а не знакомится', () => {
    const world = afterTheScene()
    expect(dialogueNodeFor('marey', world.relationships.get(MAREY_NPC))).toBe('marey-course')
  })

  it('реплика работает: он отвечает, и уважения прибавляется', () => {
    const world = afterTheScene()
    world.startDialogue('marey-course')
    const before = world.relationships.get(MAREY_NPC).respect

    expect(world.chooseOption('remember-restroom')).toContain('Итак')
    expect(world.relationships.get(MAREY_NPC).respect).toBeGreaterThan(before)
  })
})
