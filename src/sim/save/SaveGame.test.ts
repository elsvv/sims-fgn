import { describe, expect, it } from 'vitest'
import { isMoving } from '../actor/Actor'
import { COLLAPSE_MOODLET, type SleepSpotCatalog } from '../daily/Sleep'
import type { WeekendOption } from '../daily/Weekend'
import type { DialogueCatalog } from '../dialogue/Dialogue'
import type { ChainCatalog, DialogueChainData } from '../dialogue/DialogueChain'
import type { EpilogueRule } from '../epilogue/Epilogue'
import type { MoodletCatalog } from '../needs/Moodlets'
import { npcRoom, type NpcSpec } from '../npc/Npc'
import type { TeacherCatalog } from '../social/Teacher'
import type { CourseCatalog } from '../study/Course'
import type { EssayTask } from '../study/Essay'
import { occurrenceId, PERIODS, type Schedule } from '../study/Schedule'
import type { SeminarOption } from '../study/Seminar'
import { StudyState } from '../study/StudyState'
import { World } from '../World'
import type { FloorPlan } from '../world/FloorPlan'
import type { PropCatalog } from '../world/PropDefinition'
import {
  applySave,
  createSave,
  decodeSave,
  encodeSave,
  parseSave,
  SaveFormatError,
  SaveVersionError,
  SAVE_VERSION,
  type SaveGame,
} from './SaveGame'

/**
 * Сохранение и загрузка целиком.
 *
 * Главный тест здесь один — круговой: прожить день по-настоящему, снять
 * сохранение, поднять чистый мир с теми же каталогами, загрузить в него
 * файл и убедиться, что два мира неотличимы. Всё остальное в этом файле —
 * разбор того же круга по частям, чтобы при поломке было видно, какое
 * именно поле потерялось: круговой тест говорит «разъехались», а не «где».
 */

const PLAN: FloorPlan = {
  id: 'save',
  name: 'Этаж для сохранений',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['....#....', '....#....', '.........'],
  props: [
    { id: 'coffee-1', kind: 'coffeeMachine', col: 8, row: 2, rotation: 0, blocks: true },
    { id: 'bench-1', kind: 'bench', col: 0, row: 1, rotation: 0, blocks: true },
  ],
  rooms: [
    { id: 'А-204', name: 'Аудитория А-204', col0: 0, row0: 0, col1: 3, row1: 1 },
    { id: 'А-206', name: 'Аудитория А-206', col0: 5, row0: 0, col1: 8, row1: 1 },
    { id: 'коридор', name: 'Коридор', col0: 0, row0: 2, col1: 8, row1: 2 },
  ],
}

const CATALOG: PropCatalog = {
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 30,
        needDelta: { energy: 28, bladder: -12 },
        moodletId: 'coffeeFromTheMachine',
      },
    ],
  },
  bench: {
    kind: 'bench',
    label: 'Скамейка',
    size: { w: 0.9, d: 0.5, h: 0.45 },
    color: '#8a6f4d',
    blocks: true,
    interactions: [],
  },
}

const MOODLETS: MoodletCatalog = {
  coffeeFromTheMachine: {
    id: 'coffeeFromTheMachine',
    label: 'Кофе из автомата',
    mood: 8,
    durationMinutes: 120,
  },
  praisedByAlieva: {
    id: 'praisedByAlieva',
    label: 'Похвалила Алиева',
    mood: 30,
    durationMinutes: 360,
  },
  spokeWell: { id: 'spokeWell', label: 'Хорошо выступил', mood: 20, durationMinutes: 240 },
  spokeBadly: { id: 'spokeBadly', label: 'Провалил выступление', mood: -25, durationMinutes: 240 },
  sleptOnABench: {
    id: 'sleptOnABench',
    label: 'Ночевал на скамейке',
    mood: -30,
    durationMinutes: 480,
  },
  [COLLAPSE_MOODLET]: {
    id: COLLAPSE_MOODLET,
    label: 'Отрубился где стоял',
    mood: -45,
    durationMinutes: 600,
  },
}

const COURSES: CourseCatalog = {
  greek: {
    id: 'greek',
    title: 'Древнегреческий язык',
    short: 'Греческий',
    teacherId: 'alieva',
    skillIds: ['ancientLanguages'],
    assessments: [
      { id: 'classwork', label: 'Работа на занятиях', weight: 0.6, kind: 'seminar', blocking: false },
      { id: 'essay', label: 'Эссе', weight: 0.4, kind: 'essay', blocking: false },
    ],
  },
}

const SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
]

const ESSAYS: EssayTask[] = [
  {
    id: 'greek-essay',
    courseId: 'greek',
    assessmentId: 'essay',
    title: 'Эссе о «Федоне»',
    dueDay: 12,
    requiredEffort: 600,
  },
]

const SEMINAR_OPTIONS: SeminarOption[] = [
  {
    id: 'retell',
    label: 'Пересказать прочитанное',
    hint: 'Безопасно и невысоко.',
    skills: [],
    factionShift: 0,
    floor: 3,
    ceiling: 7,
  },
]

const TEACHERS: TeacherCatalog = {
  alieva: {
    id: 'alieva',
    short: 'Алиева',
    name: 'Алиева Ольга Валерьевна',
    courseIds: ['greek'],
    factionPosition: -10,
    factionTolerance: 90,
    lines: {
      greeting: ['Доброе утро.'],
      praise: ['Верно. Дальше.'],
      rebuke: ['Это не перевод, это пересказ.'],
      lateArrival: ['Мы уже начали.'],
      examPass: ['Достаточно.'],
      examFail: ['Приходите ещё раз.'],
    },
  },
}

const NPCS: NpcSpec[] = [
  { id: 'teacher-alieva', teacherId: 'alieva', courseIds: ['greek'], homeRoom: 'коридор' },
]

const DIALOGUES: DialogueCatalog = {
  'alieva-hall': {
    id: 'alieva-hall',
    speakerId: 'alieva',
    prompt: 'Вы читали к семинару?',
    options: [
      {
        id: 'honest',
        text: 'Прочитал, но половину не понял',
        effects: {
          respect: 6,
          faction: -4,
          skill: { id: 'ancientLanguages', amount: 0.5 },
        },
        reply: 'Непонятое приносите на пару. Понятое я и без вас знаю.',
      },
    ],
  },
}

/** Маленькая сцена на два шага: она одноразовая, и это видно в сохранении. */
const CHAIN: DialogueChainData = {
  id: 'в-коридоре',
  speakerId: 'alieva',
  intro: 'Вы столкнулись в коридоре за полчаса до пары.',
  startId: 'start',
  nodes: [
    {
      id: 'start',
      speakerId: 'alieva',
      prompt: 'Вы к первой паре или мимо?',
      options: [
        {
          id: 'direct',
          text: 'К вам. С вопросом по третьему склонению',
          tone: 'direct',
          effects: { respect: 9, faction: -5 },
          reply: 'Хорошо. Спрашивайте на паре, чтобы слышали все.',
          consequence: 'Вопрос по делу — она это отметила.',
          next: 'second',
        },
        {
          id: 'cautious',
          text: 'Мимо, простите',
          tone: 'cautious',
          effects: { affection: 2 },
          reply: 'Тогда до девяти.',
          consequence: 'Разговора не вышло, но и вреда никакого.',
          next: 'second',
        },
      ],
    },
    {
      id: 'second',
      speakerId: 'alieva',
      prompt: 'И всё-таки: до какого места вы дочитали?',
      options: [
        {
          id: 'finish',
          text: 'До конца, дважды',
          tone: 'scholarly',
          effects: {
            respect: 7,
            skill: { id: 'ancientLanguages', amount: 1.2 },
            moodletId: 'praisedByAlieva',
          },
          reply: 'Дважды. Это слышно по вопросу.',
          consequence: 'Она поверила, и это было приятно.',
          next: 'good',
        },
      ],
    },
    {
      id: 'good',
      speakerId: 'alieva',
      prompt: 'Ну идите, сейчас звонок.',
      options: [],
      ending: {
        id: 'good',
        title: 'Разошлись по-хорошему',
        summary: 'Она запомнила вас с лучшей стороны.',
        moodletId: 'praisedByAlieva',
      },
    },
  ],
}

const CHAINS: ChainCatalog = {
  'в-коридоре': { chain: CHAIN, room: 'коридор', once: true },
}

const SLEEP_SPOTS: SleepSpotCatalog = {
  bench: {
    id: 'bench',
    propKind: 'bench',
    label: 'Скамейка в аудитории',
    where: 'на скамейке в аудитории',
    actionLabel: 'Лечь спать прямо здесь',
    energyQuality: 0.35,
    stressRelief: 0.2,
    moodletId: 'sleptOnABench',
    afterword: 'Спина это запомнит.',
    forced: false,
  },
}

const WEEKEND_OPTIONS: readonly WeekendOption[] = [
  {
    id: 'read',
    title: 'Читать',
    description: 'Просидеть день с текстом.',
    needDelta: { social: -30 },
    skills: [{ id: 'ancientLanguages', amount: 0.9 }],
    factionShift: 6,
    outcome: 'К вечеру вы прочли тридцать страниц.',
  },
]

const ENDINGS: readonly EpilogueRule[] = [
  { id: 'survivor', title: 'Дожил до конца модуля', story: 'Шесть недель кончились.', priority: 0, when: {} },
]

const COHORT = [9, 8, 7, 6, 5, 4]

const FIRST = PERIODS[0]!
const IN_CLASS = { col: 1, row: 0 }
/** Шаг от преподавателя: в коридоре из восьми проходимых клеток он стоит в пятой. */
const NEXT_TO_TEACHER = { col: 3, row: 2 }

function makeWorld(spawn = NEXT_TO_TEACHER): World {
  const study = new StudyState({
    courses: COURSES,
    schedule: SCHEDULE,
    essays: ESSAYS,
    seminarOptions: SEMINAR_OPTIONS,
  })
  return new World(
    PLAN,
    spawn,
    CATALOG,
    study,
    MOODLETS,
    NPCS,
    { teachers: TEACHERS, dialogues: DIALOGUES, chains: CHAINS },
    {
      sleepSpots: SLEEP_SPOTS,
      weekendOptions: WEEKEND_OPTIONS,
      epilogueRules: ENDINGS,
      cohort: COHORT,
    },
  )
}

/** Прокручивает время до минуты суток, закрывая экраны, как это делает игрок. */
function runUntil(world: World, minutes: number): void {
  world.clock.speed = 3
  for (let i = 0; i < 20000 && world.clock.time.minutes < minutes; i++) {
    world.tick(0.25)
    world.dismissDaySummary()
    world.dismissWeekendReport()
  }
}

/** Доводит начатую ходьбу до конца. */
function walkOut(world: World): void {
  world.clock.speed = 3
  for (let i = 0; i < 2000 && isMoving(world.player); i++) world.tick(0.05)
}

/**
 * Мир, в котором действительно жили.
 *
 * Здесь нарочно задействовано всё, что игра умеет запоминать: разговор
 * в коридоре и сцена до самой концовки, прочитанные книги, посещённая пара,
 * выступление с оценкой, работа над эссе, начатое действие с предметом
 * и потраченное время. Круговому тесту нужен не пустой мир, а прожитый:
 * сравнивать два свежесозданных мира можно было бы и с пустой реализацией.
 */
function playedWorld(): World {
  const world = makeWorld()
  world.clock.speed = 3

  // Полчаса до пары: сцена в коридоре целиком, до концовки.
  expect(world.startChainDialogue('в-коридоре')).toBe(true)
  expect(world.chooseChainOption('direct')).not.toBeNull()
  world.continueChainDialogue()
  expect(world.chooseChainOption('finish')).not.toBeNull()
  expect(world.activeChain?.outcome?.ending.id).toBe('good')
  world.endChainDialogue()

  // Короткий обмен репликами с тем же человеком.
  expect(world.startDialogue('alieva-hall')).toBe(true)
  expect(world.chooseOption('honest')).not.toBeNull()
  world.endDialogue()

  world.markBookRead('phaedo')
  world.markBookRead('apology')

  // Пара: дойти до аудитории, отметиться, выступить.
  world.commandMoveTo(IN_CLASS)
  walkOut(world)
  runUntil(world, FIRST.startMinutes + 5)
  const spoken = world.commandSpeakAtSeminar('retell')
  expect(spoken.ok).toBe(true)

  // Эссе: начато и продвинуто, но не сдано.
  const study = world.study!
  const task = ESSAYS[0]!
  study.essays.start(task)
  study.essays.work(task.id, 140, { writingSkill: world.skills.academicWriting, stress: world.needs.stress })

  // Начатое действие с предметом: игрок дошёл до автомата и стоит у него.
  runUntil(world, FIRST.endMinutes + 10)
  expect(world.commandInteract('coffee-1', 'drinkCoffee')).toBe(true)
  walkOut(world)
  world.tick(0.25)

  return world
}

/**
 * Всё, что о мире видно снаружи.
 *
 * Снимок мира здесь главный: в нём и время, и нужды, и настроение,
 * и позиции всех до одного, и семинар, и экраны. Рядом лежит то, чего
 * в снимке нет, но что игра обязана помнить, — журналы, книги, память
 * о прошлых разговорах и счётчики модуля.
 */
function observable(world: World): unknown {
  return {
    snapshot: world.snapshot(),
    totalMinutes: world.clock.totalMinutes,
    playerPath: { moving: isMoving(world.player), facing: world.player.facing },
    npcs: world.npcManager.toJSON(),
    activeInteraction: world.activeInteraction,
    relationships: world.relationships.toJSON(),
    moodlets: world.moodlets.toJSON(),
    readBooks: world.readBooks,
    visitedNodes: world.visitedNodes,
    playedChains: world.playedChains,
    lastSpeech: world.lastSpeech,
    study: world.study?.toJSON() ?? null,
    daySummary: world.daySummary,
    weekendPending: world.weekendPending,
    weekendReport: world.weekendReport,
    epilogue: world.epilogue,
    averageStress: world.averageStress,
    epilogueFacts: world.epilogueFacts(),
  }
}

/** Проводит сохранение через настоящую строку: в хранилище оно живёт текстом. */
function roundTrip(world: World, spawn = NEXT_TO_TEACHER): World {
  const text = encodeSave(createSave(world, 1_700_000_000_000))
  const loaded = makeWorld(spawn)
  applySave(loaded, decodeSave(text))
  return loaded
}

describe('SaveGame: круговой тест', () => {
  it('прожитый мир действительно прожит', () => {
    const world = playedWorld()

    // Если эти проверки перестанут выполняться, круговой тест ниже начнёт
    // сравнивать пустоту с пустотой и молча пройдёт.
    expect(world.clock.time.minutes).toBeGreaterThan(FIRST.endMinutes)
    expect(world.faction).not.toBe(0)
    expect(world.skills.ancientLanguages).toBeGreaterThan(0)
    expect(world.relationships.get('teacher-alieva').respect).toBeGreaterThan(0)
    expect(world.moodlets.size).toBeGreaterThan(0)
    expect(world.readBooks.length).toBe(2)
    expect(world.visitedNodes.length).toBeGreaterThan(2)
    expect(world.playedChains).toEqual(['в-коридоре'])
    expect(world.lastSpeech).not.toBeNull()
    expect(world.activeInteraction).not.toBeNull()
    expect(world.needs.energy).toBeLessThan(100)
    expect(world.study?.gradebook.gradeFor('greek', 'classwork')).not.toBeNull()
  })

  it('загруженный мир совпадает с сохранённым по всем полям', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(observable(loaded)).toEqual(observable(played))
  })

  it('круг переживает и второй оборот', () => {
    const played = playedWorld()
    const twice = roundTrip(roundTrip(played))
    expect(observable(twice)).toEqual(observable(played))
  })

  it('загруженный мир продолжает жить так же, как исходный', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)

    for (let i = 0; i < 400; i++) {
      played.tick(0.25)
      loaded.tick(0.25)
    }
    expect(observable(loaded)).toEqual(observable(played))
  })

  it('стартовая клетка чистого мира не подменяет сохранённое место', () => {
    const played = playedWorld()
    const loaded = roundTrip(played, IN_CLASS)
    expect(loaded.player.position).toEqual(played.player.position)
    expect(loaded.currentRoom).toBe(played.currentRoom)
  })
})

describe('SaveGame: что именно попадает в сохранение', () => {
  it('время и скорость', () => {
    const played = playedWorld()
    played.clock.speed = 2
    const loaded = roundTrip(played)
    expect(loaded.clock.totalMinutes).toBe(played.clock.totalMinutes)
    expect(loaded.clock.time).toEqual(played.clock.time)
    expect(loaded.clock.speed).toBe(2)
  })

  it('нужды и настроение', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.needs).toEqual(played.needs)
    expect(loaded.mood).toBeCloseTo(played.mood, 10)
    expect(loaded.baseMood).toBeCloseTo(played.baseMood, 10)
  })

  it('навыки', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.skills).toEqual(played.skills)
    expect(loaded.skills.ancientLanguages).toBeGreaterThan(0)
  })

  it('модификаторы настроения вместе со сроками', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.moodlets.toJSON()).toEqual(played.moodlets.toJSON())

    // Срок хранится абсолютной минутой модуля, поэтому загрузка не продлевает
    // действие: кофе, выпитый до сохранения, кончится ровно тогда же.
    const minute = played.clock.totalMinutes
    expect(loaded.moodlets.active(minute + 130).map((item) => item.id)).not.toContain(
      'coffeeFromTheMachine',
    )
  })

  it('позиция игрока и направление взгляда', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.player.position).toEqual(played.player.position)
    expect(loaded.player.facing).toBe(played.player.facing)
  })

  it('места жителей этажа, а не их домашние клетки', () => {
    // Преподаватель сохраняется там, где его застали. Сохранившись во время
    // пары, игрок при загрузке должен увидеть её у доски, а не в коридоре,
    // где менеджер расставляет всех при создании мира.
    const played = makeWorld(IN_CLASS)
    runUntil(played, FIRST.startMinutes + 5)
    const before = { ...played.npcManager.find('teacher-alieva')!.actor.position }
    expect(npcRoom(played.grid, played.npcManager.find('teacher-alieva')!)).toBe('А-204')

    const loaded = roundTrip(played, IN_CLASS)
    const fresh = makeWorld().npcManager.find('teacher-alieva')!.actor.position
    expect(before).not.toEqual(fresh)
    expect(loaded.npcManager.find('teacher-alieva')!.actor.position).toEqual(before)
    expect(npcRoom(loaded.grid, loaded.npcManager.find('teacher-alieva')!)).toBe('А-204')
  })

  it('отношения по обоим измерениям', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.relationships.toJSON()).toEqual(played.relationships.toJSON())
    expect(loaded.relationships.describeFor('teacher-alieva')).toBe(
      played.relationships.describeFor('teacher-alieva'),
    )
  })

  it('шкала философских традиций', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.faction).toBe(played.faction)
    expect(loaded.snapshot().factionLabel).toBe(played.snapshot().factionLabel)
  })

  it('учебное состояние: оценки, посещаемость, эссе, выступления', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    const study = loaded.study!
    const before = played.study!
    const occurrence = occurrenceId(0, 'greek-mon')

    expect(study.toJSON()).toEqual(before.toJSON())
    expect(study.gradebook.gradeFor('greek', 'classwork')).toBe(
      before.gradebook.gradeFor('greek', 'classwork'),
    )
    expect(study.attendance.markFor(occurrence)).toBe('present')
    expect(study.hasSpokenAt(occurrence)).toBe(true)
    expect(study.gradeAt(occurrence)).toBe(before.gradeAt(occurrence))
    expect(study.spokenCount).toBe(1)
    expect(study.essays.progressFor('greek-essay')?.effort).toBe(140)
    expect(study.statusFor('greek')).toEqual(before.statusFor('greek'))
  })

  it('второе выступление после загрузки идёт в то же среднее', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)

    // Журнал помнит, что одно выступление уже было: иначе среднее за модуль
    // после загрузки посчиталось бы с чистого листа.
    loaded.study!.speakAt(occurrenceId(7, 'greek-mon'), 'greek', 10)
    played.study!.speakAt(occurrenceId(7, 'greek-mon'), 'greek', 10)
    expect(loaded.study!.gradebook.gradeFor('greek', 'classwork')).toBe(
      played.study!.gradebook.gradeFor('greek', 'classwork'),
    )
    expect(loaded.study!.spokenCount).toBe(2)
  })

  it('история диалогов: пройденные узлы, сыгранные сцены, прочитанные книги', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.visitedNodes).toEqual(played.visitedNodes)
    expect(loaded.playedChains).toEqual(played.playedChains)
    expect(loaded.readBooks).toEqual(played.readBooks)
    expect(loaded.hasVisitedNode('good')).toBe(true)
  })

  it('одноразовая сцена после загрузки второй раз не предлагается', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    loaded.commandMoveTo(NEXT_TO_TEACHER)
    walkOut(loaded)
    expect(loaded.availableChains()).not.toContain('в-коридоре')
    expect(loaded.startChainDialogue('в-коридоре')).toBe(false)
  })

  it('последнее выступление вместе с ответом преподавателя', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.lastSpeech).toEqual(played.lastSpeech)
    expect(loaded.lastSpeech?.reply).not.toBeNull()
  })

  it('начатое действие с предметом продолжается с той же минуты', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)
    expect(loaded.activeInteraction).toEqual(played.activeInteraction)
    expect(loaded.activeInteraction?.remainingMinutes).toBeLessThan(30)
    expect(loaded.activeInteraction?.remainingMinutes).toBeGreaterThan(0)

    // Действие доводится до конца, и эффект применяется один раз.
    runUntil(loaded, FIRST.endMinutes + 70)
    runUntil(played, FIRST.endMinutes + 70)
    expect(loaded.activeInteraction).toBeNull()
    expect(loaded.needs.energy).toBeCloseTo(played.needs.energy, 10)
    expect(loaded.moodlets.has('coffeeFromTheMachine')).toBe(true)
  })

  it('идущий разговор не сохраняется: сохранение снимает мир, а не окно поверх него', () => {
    const world = makeWorld()
    expect(world.startDialogue('alieva-hall')).toBe(true)

    const loaded = roundTrip(world)
    expect(loaded.activeDialogue).toBeNull()
    expect(loaded.activeChain).toBeNull()
    expect(loaded.snapshot().activeDialogue).toBeNull()

    // Узел засчитан пройденным ещё в начале разговора — эту память сохранение
    // уносит с собой, и следующий разговор о ней знает.
    expect(loaded.hasVisitedNode('alieva-hall')).toBe(true)
  })
})

describe('SaveGame: суточный цикл', () => {
  /** Укладывает игрока спать на скамейке и доводит ночь до итогов дня. */
  function sleepIt(world: World): void {
    world.commandMoveTo(IN_CLASS)
    walkOut(world)
    expect(world.commandSleep('bench-1')).toBe(true)
    world.clock.speed = 3
    for (let i = 0; i < 200 && world.daySummary === null; i++) world.tick(0.25)
    expect(world.daySummary).not.toBeNull()
  }

  it('экран итогов дня переживает сохранение', () => {
    const played = playedWorld()
    sleepIt(played)

    const loaded = roundTrip(played)
    expect(loaded.daySummary).toEqual(played.daySummary)
    expect(loaded.snapshot().dayScreen?.kind).toBe('summary')

    // Пока экран не закрыт, время стоит и в загруженном мире тоже.
    const before = loaded.clock.totalMinutes
    loaded.tick(0.25)
    expect(loaded.clock.totalMinutes).toBe(before)
  })

  it('прожитый после загрузки день подводит те же итоги', () => {
    const played = playedWorld()
    const loaded = roundTrip(played)

    // Итоги дня считаются от утреннего слепка навыков и отношений. Слепок
    // невидим снаружи, и проверить его можно только так: доспать день
    // в обоих мирах и сравнить рассказ.
    sleepIt(played)
    sleepIt(loaded)
    expect(loaded.daySummary).toEqual(played.daySummary)
  })

  it('ожидающая карточка воскресенья переживает сохранение', () => {
    const world = makeWorld()
    world.weekendPending = true
    const loaded = roundTrip(world)
    expect(loaded.weekendPending).toBe(true)
    expect(loaded.snapshot().dayScreen?.kind).toBe('weekend')
    expect(loaded.chooseWeekendOption('read')).not.toBeNull()
  })

  it('эпилог переживает сохранение', () => {
    const world = makeWorld()
    world.epilogue = { endingId: 'survivor', title: 'Дожил', story: 'Кончилось.', paragraphs: ['Всё.'] }
    const loaded = roundTrip(world)
    expect(loaded.epilogue).toEqual(world.epilogue)
    expect(loaded.snapshot().dayScreen?.kind).toBe('epilogue')
  })

  it('средний стресс за модуль считается дальше, а не с нуля', () => {
    const played = playedWorld()
    expect(played.averageStress).toBeGreaterThan(0)
    const loaded = roundTrip(played)
    expect(loaded.averageStress).toBeCloseTo(played.averageStress, 10)
  })
})

describe('SaveGame: формат файла', () => {
  it('в сохранении есть версия схемы, время и игровой день', () => {
    const world = playedWorld()
    const save = createSave(world, 1_700_000_000_000)

    expect(save.version).toBe(SAVE_VERSION)
    expect(save.meta.savedAt).toBe(1_700_000_000_000)
    expect(save.meta.day).toBe(world.clock.time.day)
    expect(save.meta.dayLabel).toBe(world.snapshot().dayLabel)
    expect(save.meta.timeLabel).toBe(world.clock.formatTime())
  })

  it('сохранение не меняется вслед за миром', () => {
    const world = playedWorld()
    const save = createSave(world, 1)
    const energy = save.world.needs.energy
    const books = [...save.world.readBooks]

    runUntil(world, FIRST.endMinutes + 200)
    world.markBookRead('theaetetus')

    expect(save.world.needs.energy).toBe(energy)
    expect(save.world.readBooks).toEqual(books)
  })

  it('загруженное состояние не остаётся связано с файлом', () => {
    const world = playedWorld()
    const save = createSave(world, 1)
    const loaded = makeWorld()
    applySave(loaded, save)

    loaded.markBookRead('theaetetus')
    loaded.relationships.adjust('teacher-alieva', { respect: 50 })
    expect(save.world.readBooks).not.toContain('theaetetus')
    expect(save.world.relationships['teacher-alieva']?.respect).toBe(
      world.relationships.get('teacher-alieva').respect,
    )
  })

  it('строка сохранения читается обратно без потерь', () => {
    const save = createSave(playedWorld(), 42)
    expect(decodeSave(encodeSave(save))).toEqual(save)
  })
})

describe('SaveGame: несовместимые и битые файлы', () => {
  function futureSave(): SaveGame {
    const save = createSave(makeWorld(), 1)
    return { ...save, version: SAVE_VERSION + 1 }
  }

  it('сохранение будущей версии не загружается, и об этом сказано по-русски', () => {
    const loaded = makeWorld()
    expect(() => applySave(loaded, futureSave())).toThrow(SaveVersionError)
    try {
      applySave(loaded, futureSave())
    } catch (error) {
      expect(error).toBeInstanceOf(SaveVersionError)
      expect((error as SaveVersionError).found).toBe(SAVE_VERSION + 1)
      expect((error as SaveVersionError).expected).toBe(SAVE_VERSION)
      expect((error as Error).message).toContain('более новой версией игры')
    }
  })

  it('сохранение старой версии не загружается', () => {
    const save = { ...createSave(makeWorld(), 1), version: SAVE_VERSION - 1 }
    expect(() => decodeSave(JSON.stringify(save))).toThrow(SaveVersionError)
    expect(() => decodeSave(JSON.stringify(save))).toThrow(/старой версией игры/)
  })

  it('несовместимое сохранение не портит уже идущую игру', () => {
    const world = playedWorld()
    const before = observable(world)
    expect(() => applySave(world, futureSave())).toThrow(SaveVersionError)
    expect(observable(world)).toEqual(before)
  })

  it('мусор вместо сохранения отвергается с внятной причиной', () => {
    expect(() => decodeSave('это не json')).toThrow(SaveFormatError)
    expect(() => decodeSave('это не json')).toThrow(/не читается/)
    expect(() => decodeSave('[]')).toThrow(SaveFormatError)
    expect(() => decodeSave('null')).toThrow(SaveFormatError)
    expect(() => parseSave({ meta: {}, world: {} })).toThrow(/версия схемы/)
  })

  it('обрубленное сохранение отвергается до того, как его начнут применять', () => {
    const save = createSave(playedWorld(), 1)
    const broken = JSON.parse(JSON.stringify(save)) as Record<string, unknown>
    const world = broken.world as Record<string, unknown>
    delete world.needs
    delete world.day

    expect(() => parseSave(broken)).toThrow(SaveFormatError)
    expect(() => parseSave(broken)).toThrow(/needs, day/)
  })

  it('сохранение без сведений о времени отвергается', () => {
    const save = createSave(playedWorld(), 1)
    expect(() => parseSave({ ...save, meta: { savedAt: 'вчера' } })).toThrow(SaveFormatError)
  })
})
