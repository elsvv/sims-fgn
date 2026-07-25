import {
  createActor,
  isMoving,
  setDestination,
  stepActor,
  stopActor,
  type Actor,
} from './actor/Actor'
import {
  isPastCurfew,
  livingDay,
  minutesUntilCurfew,
  minutesUntilMorning,
} from './daily/DayCycle'
import {
  summarizeDay,
  type DayFacts,
  type DayLessonFact,
  type DayPersonFact,
  type DaySkillFact,
  type DaySummary,
} from './daily/DaySummary'
import {
  COLLAPSE_SPOT,
  sleepThroughNight,
  type SleepOutcome,
  type SleepSpot,
  type SleepSpotCatalog,
} from './daily/Sleep'
import {
  describeWeekend,
  findWeekendOption,
  type WeekendOption,
  type WeekendReport,
} from './daily/Weekend'
import type { ConsequenceChange, ConsequenceReport, DialogueTone } from './dialogue/Consequences'
import { TONE_LABELS, toneHint } from './dialogue/Consequences'
import {
  buildEpilogue,
  type EpilogueCourseFact,
  type EpilogueFacts,
  type EpiloguePersonFact,
  type EpilogueReport,
  type EpilogueRule,
} from './epilogue/Epilogue'
import type { DialogueCatalog, DialogueContext } from './dialogue/Dialogue'
import { isAvailable } from './dialogue/Dialogue'
import {
  Conversation,
  type ChainCatalog,
  type ChainEffects,
  type ChainNode,
  type ConversationOutcome,
} from './dialogue/DialogueChain'
import { describeRequirement, type RequirementLabels } from './dialogue/Requirements'
import {
  findAdjacentCell,
  findApproachCell,
  isWithinTalkRange,
} from './interaction/approach'
import {
  MoodletList,
  moodletFrom,
  type MoodletCatalog,
  type MoodletSpec,
} from './needs/Moodlets'
import {
  applyNeedDelta,
  calculateMood,
  createNeeds,
  decayNeeds,
  type Needs,
} from './needs/needs'
import { NpcManager, npcRoom, type Npc, type NpcSnapshot, type NpcSpec } from './npc/Npc'
import {
  createSkills,
  gainSkill,
  isSkillId,
  SKILL_IDS,
  SKILL_LABELS,
  type SkillId,
  type Skills,
} from './player/Skills'
import type { DayBaselineState, WorldState } from './save/SaveGame'
import {
  openDialogue,
  resolveEffects,
  respectMultiplier,
  type ActiveDialogue,
} from './social/Conversation'
import { affinity, clampFaction, factionLabel } from './social/Faction'
import { RelationshipMap, type Relationship } from './social/Relationship'
import type { Teacher, TeacherCatalog } from './social/Teacher'
import type { AttendanceCounts } from './study/Attendance'
import { decideAttendance } from './study/AttendanceTracker'
import { dayKind, describeDay } from './study/Calendar'
import { PASSING_GRADE } from './study/Course'
import { HELD_ASSESSMENT_KINDS } from './study/Gradebook'
import { rankAmong } from './study/Rating'
import {
  lessonAt,
  lessonsOnDay,
  nextLessonOnDay,
  occurrenceId,
  periodOf,
  type Lesson,
} from './study/Schedule'
import {
  availableSeminarOptions,
  isSeminarOptionAvailable,
  performSpeech,
  pickLine,
  seminarRefusal,
  SEMINAR_REFUSALS,
  type SeminarRefusal,
} from './study/Seminar'
import type { StudyState } from './study/StudyState'
import { GameClock, MINUTES_PER_DAY, type Speed } from './time/GameClock'
import type { GridPos, Vec2 } from './types'
import type { FloorPlan } from './world/FloorPlan'
import { NavGrid } from './world/NavGrid'
import type { PropCatalog } from './world/PropDefinition'

/**
 * Максимальная длительность одного тика в реальных секундах.
 * Защищает от гигантского скачка после того, как вкладка была свёрнута.
 */
const MAX_TICK_SECONDS = 0.25

/** Сколько минут занимает «улечься». Сам сон начинается после этого. */
const SLEEP_SETTLE_MINUTES = 5

/** Идентификатор действия «лечь спать»: своего описания в каталоге предметов у него нет. */
const SLEEP_INTERACTION_ID = 'sleep'

/**
 * Ниже этого прироста навык за день не считается изменившимся.
 *
 * Иначе итоги дня сообщали бы о трёх сотых красноречия, полученных за одно
 * слово в коридоре, — а это не событие дня, это шум.
 */
const SKILL_CHANGE_THRESHOLD = 0.05

/**
 * Глубокая копия простых данных: рассказ о дне, эссе, слепок утра.
 *
 * Нужна и при снятии сохранения, и при загрузке, и по одной причине:
 * состояние в файле и состояние в мире не должны оказаться одним и тем же
 * объектом. Иначе сохранение продолжало бы меняться вместе с игрой.
 */
function cloneData<T>(value: T): T {
  return value === null ? value : (JSON.parse(JSON.stringify(value)) as T)
}

export interface ActiveInteraction {
  propId: string
  interactionId: string
  label: string
  /** Сколько игровых минут действия осталось. Тикает только когда персонаж дошёл. */
  remainingMinutes: number
  needDelta: Partial<Needs>
  /** Какой модификатор настроения повесить по завершении. null — никакого. */
  moodletId: string | null
  /**
   * Вид предмета, на котором собираются спать. null — обычное действие.
   * По завершении такого действия день кончается: см. advanceInteraction.
   */
  sleepSpotKind: string | null
}

/** Действующий модификатор настроения в снимке состояния. */
export interface ActiveMoodlet {
  id: string
  label: string
  mood: number
}

/** Пара, которая идёт прямо сейчас. */
export interface CurrentLessonInfo {
  courseId: string
  room: string
  kind: Lesson['kind']
}

/** Ближайшая пара, которая ещё не началась. */
export interface NextLessonInfo {
  courseId: string
  room: string
  /** Через сколько игровых минут звонок. */
  startsInMinutes: number
}

/** Отношения с одним человеком в снимке состояния. */
export interface RelationshipInfo {
  npcId: string
  teacherId: string | null
  affection: number
  respect: number
  /** Словесная оценка: «Незнакомы», «Знакомы», «Хорошие отношения». */
  label: string
}

/** Реплика игрока в снимке состояния: только то, что видно в меню. */
export interface DialogueOptionInfo {
  id: string
  text: string
}

/** Разговор, идущий прямо сейчас, в снимке состояния. */
export interface ActiveDialogueInfo {
  nodeId: string
  /** С кем разговариваем: идентификатор NPC. */
  npcId: string
  /** Чьим голосом написан узел: идентификатор преподавателя. */
  speakerId: string
  prompt: string
  options: DialogueOptionInfo[]
  /** Ответ собеседника. null — игрок ещё не выбрал реплику. */
  reply: string | null
}

/**
 * Реплика многошагового разговора глазами игрока.
 *
 * Ни одного числа: до выбора игрок видит текст, тон и — если реплика
 * закрыта — чего для неё не хватает.
 */
export interface ChainOptionInfo {
  id: string
  text: string
  tone: DialogueTone
  /** Тон одним словом: «дерзко». */
  toneLabel: string
  /** Пояснение к тону: «Дерзко. Это заметят.» */
  toneHint: string
  /** Можно ли это сказать прямо сейчас. */
  available: boolean
  /** Чего не хватает, если нельзя: «нужны древние языки». */
  lockHint: string | null
}

/** Что игрок узнаёт сразу после выбора реплики: слова, а не арифметика. */
export interface ChainConsequenceInfo {
  /** Авторская фраза: что произошло между вами и почему. */
  reason: string
  /** Она же вместе с описанием изменений. */
  text: string
  changes: ConsequenceChange[]
}

/** Итог законченного разговора. */
export interface ChainOutcomeInfo {
  endingId: string
  /** Название исхода: «Братство по оружию». */
  title: string
  summary: string
  /** «В сумме: уважение сильно выросло, симпатия заметно упала.» */
  closing: string
  changes: ConsequenceChange[]
}

/** Многошаговый разговор, идущий прямо сейчас. */
export interface ActiveChainInfo {
  chainId: string
  /** С кем говорим: идентификатор NPC. */
  npcId: string
  /** Чьим голосом написана сцена: идентификатор преподавателя. */
  speakerId: string
  /** Завязка сцены. Показывается один раз, до первой реплики. */
  intro: string | null
  /** Узел, на котором стоим. Пусто, когда разговор кончился. */
  nodeId: string | null
  /**
   * Реплика, на которую игрок сейчас отвечает. Пока на экране реакция
   * собеседника на прошлый выбор, следующая реплика ещё не показана:
   * иначе игрок читал бы ответ и продолжение одновременно и в обратном
   * порядке.
   */
  prompt: string | null
  options: ChainOptionInfo[]
  /**
   * Игрок только что ответил и ещё не нажал «Дальше»: на экране реакция
   * собеседника, а не новый выбор. Без этого признака ответ и следующая
   * реплика слились бы в одну стену текста.
   */
  awaitingContinue: boolean
  /** Что собеседник ответил на прошлый выбор. */
  reply: string | null
  consequence: ChainConsequenceInfo | null
  /** Итог, если разговор дошёл до концовки. */
  outcome: ChainOutcomeInfo | null
}

/** Способ выступить в снимке состояния: только то, что видно в панели. */
export interface SeminarOptionInfo {
  id: string
  label: string
  /** Короткое пояснение, что этот способ даёт. */
  hint: string
}

/** Состоявшееся выступление: оценка и то, что на неё ответили. */
export interface SeminarSpeechInfo {
  /** Пара, на которой это случилось: день плюс слот расписания. */
  occurrenceId: string
  courseId: string
  optionId: string
  teacherId: string | null
  /** Оценка за выступление, целое 0..10. */
  grade: number
  success: boolean
  /** Реплика преподавателя из его набора praise или rebuke. null — отвечать некому. */
  reply: string | null
}

/** Семинар, на котором игрок сидит прямо сейчас. */
export interface SeminarInfo {
  courseId: string
  /** Слот расписания: «greek-mon». Конкретный день лежит в speech.occurrenceId. */
  lessonId: string
  teacherId: string | null
  /** Можно ли выступить прямо сейчас. */
  canSpeak: boolean
  /** Почему нельзя, если нельзя: «Вы уже выступали». */
  reason: string | null
  options: SeminarOptionInfo[]
  /** Выступление на этой же паре, если оно уже состоялось. */
  speech: SeminarSpeechInfo | null
}

/** Ответ на команду выступить: результат или отказ с причиной. */
export type SeminarOutcome =
  | { ok: true; speech: SeminarSpeechInfo }
  | { ok: false; reason: string }

/** Кто и что делится с миром социальными данными. Пустой — мир без людей. */
export interface SocialConfig {
  teachers: TeacherCatalog
  dialogues: DialogueCatalog
  /** Многошаговые сцены. Не указаны — мир только с короткими обменами. */
  chains?: ChainCatalog
}

const EMPTY_SOCIAL: SocialConfig = { teachers: {}, dialogues: {} }

/**
 * Данные суточного цикла: где спят, чем занимают выходной, чем кончается
 * модуль. Всё необязательно — мир без них просто никогда не кончается,
 * и так собраны тесты движения, нужд и разговоров.
 */
export interface DailyConfig {
  /** Места для сна по видам предметов. Ключ — kind предмета. */
  sleepSpots?: SleepSpotCatalog
  weekendOptions?: readonly WeekendOption[]
  epilogueRules?: readonly EpilogueRule[]
  /** Средние баллы однокурсников: по ним считается место в рейтинге. */
  cohort?: readonly number[]
}

const EMPTY_DAILY: DailyConfig = {}

/** Что за экран стоит между игроком и миром. */
export type DayScreenKind = 'summary' | 'weekend' | 'epilogue'

/** Вариант выходного глазами игрока: заголовок и что это значит. */
export interface WeekendOptionInfo {
  id: string
  title: string
  description: string
}

/**
 * Экран, который прерывает игру: итоги дня, карточка воскресенья, эпилог.
 *
 * Пока он есть, время стоит и мир не тикает — игрок сейчас не в мире.
 */
export interface DayScreenInfo {
  kind: DayScreenKind
  /** Итоги прожитого дня. */
  summary: DaySummary | null
  /** Варианты выходного. Пусто, если выбор уже сделан. */
  weekendOptions: WeekendOptionInfo[]
  /** Чем кончился выходной. */
  weekendReport: WeekendReport | null
  epilogue: EpilogueReport | null
}

/**
 * Состояние на утро текущего дня.
 *
 * Итоги дня — это разница между утром и вечером, и снимать её надо
 * с чего-то: журнал приращений пришлось бы вести на каждой реплике
 * и в каждом выступлении, а слепок стоит один раз в сутки.
 *
 * Тип взят у сохранения: слепок утра уезжает в файл целиком, и два
 * описания одного и того же рано или поздно разъехались бы.
 */
type DayBaseline = DayBaselineState

/**
 * Идущий многошаговый разговор.
 *
 * Контекст доступности реплик снят один раз, в момент начала: иначе
 * на глазах у игрока строки меню появлялись бы и пропадали от его же
 * собственного выбора. То же правило действует в одношаговых разговорах,
 * см. social/Conversation.ts.
 */
interface ActiveChain {
  chainId: string
  npcId: string
  talk: Conversation
  context: DialogueContext
  /** Узел, на котором стоим. null — разговор дошёл до концовки. */
  node: ChainNode | null
  /** Последняя реплика собеседника: у концовки это её текст. */
  line: string
  /** Показана ли завязка. */
  introSeen: boolean
  awaitingContinue: boolean
  reply: string | null
  consequence: ConsequenceReport | null
  outcome: ConversationOutcome | null
}

export interface WorldSnapshot {
  day: number
  minutes: number
  timeLabel: string
  dayLabel: string
  speed: Speed
  needs: Needs
  /** Итоговое настроение: базовое от нужд плюс сумма модификаторов, 0..100. */
  mood: number
  skills: Skills
  activeMoodlets: ActiveMoodlet[]
  playerPosition: Vec2
  playerFacing: number
  isPlayerMoving: boolean
  /** Подпись текущего занятия или null, если персонаж свободен. */
  activity: string | null
  /** Помещение, где стоит персонаж: «А-204», «коридор». null — в дверях или в стене. */
  currentRoom: string | null
  currentLesson: CurrentLessonInfo | null
  nextLesson: NextLessonInfo | null
  /** Остальные жители этажа: преподаватели, позже — однокурсники. */
  npcs: NpcSnapshot[]
  /** Позиция игрока на шкале философских традиций, −100..100. */
  faction: number
  /** Та же позиция словами: «Скорее аналитик». */
  factionLabel: string
  /** Отношения со всеми жителями этажа, по одной записи на человека. */
  relationships: RelationshipInfo[]
  /** Разговор, идущий прямо сейчас, или null. */
  activeDialogue: ActiveDialogueInfo | null
  /** Многошаговая сцена, идущая прямо сейчас, или null. */
  activeChain: ActiveChainInfo | null
  /** Сцены, которые можно завести здесь и сейчас. */
  availableChains: string[]
  /** Можно ли выступить на семинаре прямо сейчас. */
  canSpeakAtSeminar: boolean
  /** Семинар, на котором игрок сидит, или null. */
  seminar: SeminarInfo | null
  /** Сколько игровых минут осталось до того, как персонаж вырубится сам. */
  minutesUntilCurfew: number
  /** Экран, прерывающий игру: итоги дня, воскресенье, эпилог. */
  dayScreen: DayScreenInfo | null
}

/**
 * Корень симуляции. Владеет временем, миром и состоянием игрока.
 * Ничего не знает о рендере: слой представления читает snapshot().
 * Каталог предметов передаётся снаружи, чтобы sim не зависел от content.
 */
export class World {
  readonly clock = new GameClock()
  readonly grid: NavGrid
  readonly plan: FloorPlan
  readonly catalog: PropCatalog
  /** Каталог заготовок модификаторов настроения. Пустой — мир без них. */
  readonly moodletCatalog: MoodletCatalog
  /** Учебное состояние. null — мир без учёбы: так собраны тесты движения и нужд. */
  readonly study: StudyState | null
  readonly moodlets = new MoodletList()
  /** Жители этажа. Их распорядок задан расписанием, а не игроком. */
  readonly npcManager: NpcManager
  /** Преподаватели по идентификаторам: нужны ради позиции на шкале традиций. */
  readonly teachers: TeacherCatalog
  /** Узлы разговоров по идентификаторам. */
  readonly dialogues: DialogueCatalog
  /** Многошаговые сцены по идентификаторам. */
  readonly chains: ChainCatalog
  /** Отношения со всеми, с кем игрок имел дело. Ключ — идентификатор NPC. */
  readonly relationships = new RelationshipMap()
  /**
   * Названия для подсказок о закрытых репликах. Подписи модификаторов мир
   * знает сам — они лежат в его же каталоге, — и тогда вместо общего
   * «нужно подходящее настроение» игрок читает, чего именно ждут.
   */
  private readonly requirementLabels: RequirementLabels
  player: Actor
  needs: Needs = createNeeds()
  skills: Skills = createSkills()
  activeInteraction: ActiveInteraction | null = null
  /** Позиция игрока на шкале философских традиций, −100..100. Начало — 0. */
  faction = 0
  /**
   * Прочитанные книги. Открывают реплики, которых иначе не сказать.
   * Само чтение появится вместе с библиотекой; здесь — только список.
   */
  readBooks: string[] = []
  activeDialogue: ActiveDialogue | null = null
  /** Идущая многошаговая сцена или null. */
  activeChain: ActiveChain | null = null
  /** Сцены, которые уже сыграны: одноразовые второй раз не предлагаются. */
  playedChains: string[] = []
  /**
   * Узлы разговоров, через которые игрок прошёл, — память о прошлых
   * разговорах. Из неё разговоры узнают друг о друге: реплика может
   * потребовать, чтобы у этих двоих уже был определённый разговор,
   * и тогда встреча в коридоре начинается не с нуля.
   *
   * Хранятся идентификаторы узлов, а не сцен: важно не только то, что
   * разговор был, но и чем он кончился, — а конец разговора это тоже узел.
   */
  visitedNodes: string[] = []
  /**
   * Последнее выступление на семинаре. Живёт до конца той пары, на которой
   * состоялось: панель показывает ответ преподавателя, пока игрок сидит
   * в аудитории, и не тащит его в следующий день.
   */
  lastSpeech: SeminarSpeechInfo | null = null

  /** Места, где можно лечь спать. Ключ — вид предмета. */
  readonly sleepSpots: SleepSpotCatalog
  /** Как можно провести воскресенье. Пусто — воскресенье отыгрывается как будни. */
  readonly weekendOptions: readonly WeekendOption[]
  /** Концовки модуля. Пусто — эпилог обойдётся одной общей. */
  readonly epilogueRules: readonly EpilogueRule[]
  /** Средние баллы однокурсников для рейтинга. */
  readonly cohort: readonly number[]

  /** Итоги прожитого дня, ждущие прочтения. */
  daySummary: DaySummary | null = null
  /** Карточка воскресенья ждёт выбора. */
  weekendPending = false
  /** Чем кончился выходной. */
  weekendReport: WeekendReport | null = null
  /** Эпилог. Появившись, не исчезает: модуль кончился. */
  epilogue: EpilogueReport | null = null

  /** Слепок утра: с ним сравниваются вечерние итоги. */
  private dayBaseline: DayBaseline
  /** Сумма стресса, взвешенная по прожитым минутам. Нужна эпилогу. */
  private stressSum = 0
  /** Сколько игровых минут персонаж провёл бодрствуя. */
  private awakeMinutes = 0

  constructor(
    plan: FloorPlan,
    spawn: GridPos,
    catalog: PropCatalog = {},
    study: StudyState | null = null,
    moodletCatalog: MoodletCatalog = {},
    npcs: readonly NpcSpec[] = [],
    social: SocialConfig = EMPTY_SOCIAL,
    daily: DailyConfig = EMPTY_DAILY,
  ) {
    this.plan = plan
    this.catalog = catalog
    this.study = study
    this.moodletCatalog = moodletCatalog
    this.teachers = social.teachers
    this.dialogues = social.dialogues
    this.chains = social.chains ?? {}
    this.sleepSpots = daily.sleepSpots ?? {}
    this.weekendOptions = daily.weekendOptions ?? []
    this.epilogueRules = daily.epilogueRules ?? []
    this.cohort = daily.cohort ?? []
    this.grid = new NavGrid(plan)
    this.player = createActor('player', this.grid.gridToWorld(spawn))
    this.npcManager = new NpcManager(npcs, this.grid, study?.config.schedule ?? [])
    this.dayBaseline = this.captureDayBaseline()

    const moodletLabels: Record<string, string> = {}
    for (const [id, spec] of Object.entries(moodletCatalog)) moodletLabels[id] = spec.label
    this.requirementLabels = { moodlets: moodletLabels }
  }

  /** Живые NPC мира. Рендер читает их напрямую, чтобы не ждать снимка. */
  get npcs(): readonly Npc[] {
    return this.npcManager.list
  }

  /**
   * Настроение персонажа, 0..100.
   *
   * Нужды дают базу, модификаторы её сдвигают: похвала Михайловского
   * вытягивает голодного и невыспавшегося, а час ожидания лифта портит
   * идеальный день. Сумма зажимается — иначе три подряд похвалы сделали бы
   * настроение бесконечным, а никакого «лучше отличного» в игре нет.
   */
  get mood(): number {
    const base = calculateMood(this.needs)
    const shift = this.moodlets.totalMood(this.clock.totalMinutes)
    return Math.min(100, Math.max(0, base + shift))
  }

  /** Базовое настроение от одних только нужд, без модификаторов. */
  get baseMood(): number {
    return calculateMood(this.needs)
  }

  /** Помещение, в котором стоит персонаж, или null. */
  get currentRoom(): string | null {
    return this.grid.roomAt(this.grid.worldToGrid(this.player.position))?.id ?? null
  }

  /** @param realDeltaSeconds время, прошедшее с прошлого кадра. */
  tick(realDeltaSeconds: number): void {
    // Пока на экране итоги дня, карточка воскресенья или эпилог, время стоит.
    // Это не пауза: игрок сейчас не в мире, и мир его не ждёт, а отсутствует.
    if (this.dayScreenKind() !== null) return

    const delta = Math.min(realDeltaSeconds, MAX_TICK_SECONDS)
    const gameMinutes = this.clock.advance(delta)
    if (gameMinutes === 0) return

    const { day, minutes } = this.clock.time
    this.needs = decayNeeds(this.needs, gameMinutes)
    this.stressSum += this.needs.stress * gameMinutes
    this.awakeMinutes += gameMinutes
    this.moodlets.prune(this.clock.totalMinutes)
    stepActor(this.player, this.grid, delta * this.clock.speed)
    this.npcManager.tick(this.grid, delta * this.clock.speed, day, minutes)
    this.advanceInteraction(gameMinutes)
    this.updateAttendance()

    // Дизайн-документ, §3: после двух ночи персонаж вырубается где стоит.
    // Проверка идёт последней: пусть последняя минута перед отбоем
    // достанется игроку целиком.
    if (isPastCurfew(this.clock.time.minutes)) this.beginSleep(COLLAPSE_SPOT)
  }

  commandMoveTo(target: GridPos): boolean {
    this.activeInteraction = null
    return setDestination(this.player, this.grid, target)
  }

  /**
   * Отправляет персонажа к предмету и ставит действие в очередь.
   * Эффект применится, когда персонаж дойдёт и отработает длительность.
   */
  commandInteract(propId: string, interactionId: string): boolean {
    const placement = this.plan.props.find((p) => p.id === propId)
    if (!placement) return false

    const definition = this.catalog[placement.kind]
    if (!definition) return false

    const interaction = definition.interactions.find((i) => i.id === interactionId)
    if (!interaction) return false

    const approach = findApproachCell(this.grid, { col: placement.col, row: placement.row })
    if (!approach) return false

    // Если персонаж уже стоит в клетке подхода, setDestination вернёт false —
    // это не ошибка, а признак того, что идти никуда не надо.
    setDestination(this.player, this.grid, approach)

    this.activeInteraction = {
      propId,
      interactionId,
      label: interaction.label,
      remainingMinutes: interaction.durationMinutes,
      needDelta: interaction.needDelta,
      moodletId: interaction.moodletId ?? null,
      sleepSpotKind: null,
    }
    return true
  }

  /* ---------------------------------------------------------------- */
  /* Суточный цикл: сон, итоги дня, воскресенье, эпилог                 */
  /* ---------------------------------------------------------------- */

  /**
   * Можно ли спать на этом предмете и как это будет выглядеть.
   *
   * Кровати в общаге ещё нет, и это ровно та причина, по которой места
   * для сна описаны данными: когда общага появится, кровать станет одной
   * записью в каталоге контента, и здесь не изменится ни строчки.
   */
  sleepSpotFor(propId: string): SleepSpot | null {
    const placement = this.plan.props.find((p) => p.id === propId)
    if (!placement) return null
    return this.sleepSpots[placement.kind] ?? null
  }

  /**
   * Отправляет персонажа спать: он идёт к месту, укладывается — и день
   * кончается. Возвращает false, если на этом предмете не спят или к нему
   * не подойти.
   */
  commandSleep(propId: string): boolean {
    const placement = this.plan.props.find((p) => p.id === propId)
    const spot = this.sleepSpotFor(propId)
    if (!placement || !spot) return false

    const approach = findApproachCell(this.grid, { col: placement.col, row: placement.row })
    if (!approach) return false

    // Как и у обычного действия: если персонаж уже стоит в клетке подхода,
    // setDestination вернёт false, и это не ошибка, а признак того,
    // что идти никуда не надо.
    setDestination(this.player, this.grid, approach)
    this.activeDialogue = null
    this.activeChain = null
    this.activeInteraction = {
      propId,
      interactionId: SLEEP_INTERACTION_ID,
      label: spot.actionLabel,
      remainingMinutes: SLEEP_SETTLE_MINUTES,
      needDelta: {},
      moodletId: null,
      sleepSpotKind: placement.kind,
    }
    return true
  }

  /**
   * Проводит ночь.
   *
   * Порядок здесь важен и весь состоит из «иначе»: сначала закрывается
   * посещаемость прожитого дня — потом время уходит вперёд, и о прогулах
   * узнать будет неоткуда. Потом применяются нужды, потом переводятся часы,
   * и только потом вешается утренний модификатор: повешенный до перевода
   * часов, он бы наполовину истёк ещё во сне.
   */
  private beginSleep(spot: SleepSpot): void {
    const { day, minutes } = this.clock.time
    const finishedDay = livingDay(day, minutes)

    this.closeAttendance(finishedDay)

    const outcome = sleepThroughNight(spot, minutes, minutesUntilMorning(minutes))
    this.applyNeeds(outcome.needDelta)
    this.clock.jump(outcome.minutes)
    this.moodlets.prune(this.clock.totalMinutes)
    if (outcome.moodletId) this.addMoodletById(outcome.moodletId)

    this.daySummary = summarizeDay(this.dayFacts(finishedDay, outcome))
    this.startNewDay()
  }

  /**
   * Проставляет прогулы за прожитый день.
   *
   * Обычно это делает тик: пара кончилась, отметки нет — прогул. Но лечь
   * спать можно и в два часа дня, и тогда вечерние пары останутся без
   * отметки навсегда. Здесь день закрывается принудительно, на его
   * последней минуте.
   */
  private closeAttendance(day: number): void {
    const study = this.study
    if (!study) return

    const decisions = decideAttendance({
      schedule: study.config.schedule,
      day,
      minutes: MINUTES_PER_DAY,
      room: null,
      markFor: (id) => study.attendance.markFor(id),
    })
    for (const decision of decisions) {
      study.attendLesson(decision.occurrenceId, decision.courseId, decision.mark)
    }
  }

  /** Начинает новые сутки: слепок утра снят, вчерашние окна закрыты. */
  private startNewDay(): void {
    this.dayBaseline = this.captureDayBaseline()
    this.activeInteraction = null
    this.activeDialogue = null
    this.activeChain = null
    this.lastSpeech = null
    stopActor(this.player)
  }

  private captureDayBaseline(): DayBaseline {
    const relationships: Record<string, Relationship> = {}
    for (const npc of this.npcs) relationships[npc.id] = { ...this.relationships.get(npc.id) }
    return { skills: { ...this.skills }, relationships, faction: this.faction }
  }

  /** Собирает всё, что случилось за день, для рассказа о нём. */
  private dayFacts(day: number, sleep: SleepOutcome): DayFacts {
    const study = this.study
    const lessons: DayLessonFact[] = []
    const submittedEssays: string[] = []

    if (study) {
      for (const lesson of lessonsOnDay(study.config.schedule, day)) {
        const occurrence = occurrenceId(day, lesson.id)
        lessons.push({
          courseId: lesson.courseId,
          courseName: study.config.courses[lesson.courseId]?.short ?? lesson.courseId,
          kind: lesson.kind,
          mark: study.attendance.markFor(occurrence),
          grade: study.gradeAt(occurrence),
        })
      }
      for (const task of study.config.essays) {
        if (study.essays.progressFor(task.id)?.submittedDay === day) {
          submittedEssays.push(task.title)
        }
      }
    }

    const people: DayPersonFact[] = []
    for (const npc of this.npcs) {
      const before = this.dayBaseline.relationships[npc.id] ?? { affection: 0, respect: 0 }
      const now = this.relationships.get(npc.id)
      const respectDelta = now.respect - before.respect
      const affectionDelta = now.affection - before.affection
      if (respectDelta === 0 && affectionDelta === 0) continue
      people.push({ name: this.personName(npc.teacherId) ?? npc.id, respectDelta, affectionDelta })
    }

    const skills: DaySkillFact[] = []
    for (const id of SKILL_IDS) {
      const delta = this.skills[id] - this.dayBaseline.skills[id]
      if (Math.abs(delta) < SKILL_CHANGE_THRESHOLD) continue
      skills.push({ label: SKILL_LABELS[id], delta })
    }

    return {
      day,
      dayLabel: describeDay(day),
      lessons,
      people,
      skills,
      factionDelta: this.faction - this.dayBaseline.faction,
      submittedEssays,
      sleep,
    }
  }

  /** Фамилия преподавателя для списков. null — за этим NPC никого нет. */
  private personName(teacherId: string | null): string | null {
    if (!teacherId) return null
    return this.teachers[teacherId]?.short ?? teacherId
  }

  /** Убирает итоги дня и открывает то, что за ними: воскресенье или эпилог. */
  dismissDaySummary(): void {
    if (!this.daySummary) return
    this.daySummary = null
    this.openScheduledScreen()
  }

  /**
   * Что показывать вместо наступившего дня.
   *
   * Воскресенье в 3D не отыгрывается (дизайн-документ, §3), а за концом
   * календаря идёт эпилог. Обычный будний день не показывает ничего —
   * игрок просто просыпается в мире.
   */
  private openScheduledScreen(): void {
    const kind = dayKind(this.clock.time.day)
    if (kind === 'over') {
      this.epilogue = buildEpilogue(this.epilogueFacts(), this.epilogueRules)
      return
    }
    if (kind === 'weekend' && this.weekendOptions.length > 0) this.weekendPending = true
  }

  /**
   * Применяет выбор выходного.
   *
   * Числа в варианте — это итог целых суток, а не часа, поэтому обычный
   * износ нужд за прокрученное воскресенье не начисляется: он уже учтён
   * в самих числах карточки.
   */
  chooseWeekendOption(optionId: string): WeekendReport | null {
    if (!this.weekendPending) return null

    const option = findWeekendOption(this.weekendOptions, optionId)
    if (!option) return null

    this.applyNeeds(option.needDelta)
    for (const gain of option.skills ?? []) this.trainSkill(gain.id, gain.amount)
    if (option.factionShift) this.faction = clampFaction(this.faction + option.factionShift)
    if (option.moodletId) this.addMoodletById(option.moodletId)

    const notes = this.workOnEssay(option.essayMinutes ?? 0)
    this.weekendPending = false
    this.weekendReport = describeWeekend(option, SKILL_LABELS, notes)
    return this.weekendReport
  }

  /** Вкладывает время выходного в ближайшее несданное эссе. */
  private workOnEssay(minutes: number): string[] {
    const study = this.study
    if (!study || minutes <= 0) return []

    const task = study.pendingEssays(this.clock.time.day)[0]
    if (!task) return []

    study.essays.start(task)
    study.essays.work(task.id, minutes, {
      writingSkill: this.skills.academicWriting,
      stress: this.needs.stress,
    })
    return [`Эссе «${task.title}» продвинулось.`]
  }

  /** Закрывает рассказ о выходном и прокручивает воскресенье: наступает понедельник. */
  dismissWeekendReport(): void {
    if (!this.weekendReport) return
    this.weekendReport = null
    this.clock.jump(minutesUntilMorning(this.clock.time.minutes))
    this.moodlets.prune(this.clock.totalMinutes)
    this.startNewDay()
    this.openScheduledScreen()
  }

  /** Средний стресс за модуль, 0..100. Считается по прожитому времени. */
  get averageStress(): number {
    return this.awakeMinutes > 0 ? this.stressSum / this.awakeMinutes : this.needs.stress
  }

  /**
   * Всё, чем модуль кончился.
   *
   * Оценка выставляется по тем элементам контроля, которые игра успела
   * провести (см. HELD_ASSESSMENT_KINDS): экзаменов пока нет, и считать
   * их несданными было бы враньём. Всё, что игра проводила, но чего игрок
   * не сделал, честно стоит ноль.
   */
  epilogueFacts(): EpilogueFacts {
    const study = this.study
    const courses: EpilogueCourseFact[] = []
    const debts: string[] = []
    const attendance: AttendanceCounts = { present: 0, late: 0, absent: 0 }
    let gradeSum = 0
    let graded = 0

    if (study) {
      for (const course of Object.values(study.config.courses)) {
        const grade = study.gradebook.settledGrade(course, HELD_ASSESSMENT_KINDS)
        const passed = grade !== null && grade >= PASSING_GRADE
        courses.push({
          id: course.id,
          title: course.title,
          short: course.short,
          teacherName: this.teachers[course.teacherId]?.name ?? null,
          grade,
          passed,
        })
        if (grade !== null) {
          gradeSum += grade
          graded += 1
          if (!passed) debts.push(course.short)
        }

        const counts = study.attendance.countByCourse(course.id)
        attendance.present += counts.present
        attendance.late += counts.late
        attendance.absent += counts.absent
      }
    }

    const gpa = graded > 0 ? gradeSum / graded : null
    const people: EpiloguePersonFact[] = this.npcs.map((npc) => {
      const { affection, respect } = this.relationships.get(npc.id)
      const teacher = npc.teacherId ? this.teachers[npc.teacherId] : undefined
      return {
        id: teacher?.id ?? npc.id,
        name: teacher?.name ?? npc.id,
        respect,
        affection,
        level: this.relationships.describeFor(npc.id),
      }
    })

    return {
      courses,
      gpa,
      debts,
      rating: gpa !== null && this.cohort.length > 0 ? rankAmong(gpa, this.cohort) : null,
      people,
      faction: this.faction,
      averageStress: this.averageStress,
      skills: this.skills,
      booksRead: this.readBooks.length,
      attendance,
      seminarsSpoken: study?.spokenCount ?? 0,
    }
  }

  /** Экран, прерывающий игру, или null. */
  private dayScreenKind(): DayScreenKind | null {
    if (this.epilogue) return 'epilogue'
    if (this.daySummary) return 'summary'
    if (this.weekendPending || this.weekendReport) return 'weekend'
    return null
  }

  private dayScreenInfo(): DayScreenInfo | null {
    const kind = this.dayScreenKind()
    if (kind === null) return null
    return {
      kind,
      summary: this.daySummary,
      weekendOptions: this.weekendPending
        ? this.weekendOptions.map(({ id, title, description }) => ({ id, title, description }))
        : [],
      weekendReport: this.weekendReport,
      epilogue: this.epilogue,
    }
  }

  /**
   * Отправляет игрока к жителю этажа.
   *
   * Разговор начинается вплотную, а кликают по человеку и с другого конца
   * коридора. Встать надо рядом, а не в него: две фигуры в одной клетке
   * читаются как одна.
   */
  commandApproachNpc(npcId: string): boolean {
    const npc = this.npcManager.find(npcId)
    if (!npc) return false

    const target = this.grid.worldToGrid(npc.actor.position)
    const room = this.grid.roomAt(target)?.id ?? null
    const cell = findAdjacentCell(
      this.grid,
      target,
      (candidate) => (this.grid.roomAt(candidate)?.id ?? null) === room,
    )
    if (!cell) return false

    this.activeInteraction = null
    const from = this.grid.worldToGrid(this.player.position)
    if (from.col === cell.col && from.row === cell.row) return true
    return setDestination(this.player, this.grid, cell)
  }

  /**
   * Начинает разговор по узлу каталога.
   *
   * Возвращает false, если узла нет, собеседника нет на этаже или игрок
   * стоит не там. «Не там» — это два условия сразу, и одного мало.
   * Общее помещение: разговаривать через стену нельзя. И расстояние:
   * коридор второго этажа длиной двадцать два метра — тоже одно помещение,
   * а окликать человека с другого его конца и получать в ответ разговор
   * вполголоса невозможно.
   *
   * Отказ не тупик: интерфейс на него отвечает тем, что персонаж идёт
   * к собеседнику сам (commandApproachNpc), и разговор начинается,
   * когда он дошёл.
   */
  startDialogue(nodeId: string): boolean {
    // Посреди сцены короткий обмен репликами не начинают: два окна
    // разговора на экране означали бы, что игрок говорит с двумя людьми
    // одновременно и ни с кем по-настоящему.
    if (this.activeChain) return false

    const node = this.dialogues[nodeId]
    if (!node) return false

    const npc = this.speakerOf(node.speakerId)
    if (!npc) return false
    if (!this.isWithinReach(npc)) return false

    // Заговорив, персонаж останавливается: разговаривать на ходу,
    // удаляясь от собеседника, он не должен.
    stopActor(this.player)
    this.activeInteraction = null
    this.activeDialogue = openDialogue(npc.id, node, this.dialogueContext(npc.id))
    // Узел засчитывается после того, как контекст снят: иначе реплика
    // внутри узла, ссылающаяся на этот же узел, оказалась бы открыта
    // с первого раза — «вспомните разговор, который идёт прямо сейчас».
    this.markNodeVisited(node.id)
    return true
  }

  /**
   * Применяет эффекты выбранной реплики и возвращает ответ собеседника.
   * null — если разговора нет, реплика уже сказана или такой реплики
   * в этом разговоре нет.
   */
  chooseOption(optionId: string): string | null {
    const dialogue = this.activeDialogue
    if (!dialogue || dialogue.reply !== null) return null

    const option = dialogue.options.find((item) => item.id === optionId)
    if (!option) return null

    const multiplier = respectMultiplier(this.teacherFor(dialogue.npcId), this.faction)
    const gains = resolveEffects(option.effects, multiplier)

    this.relationships.adjust(dialogue.npcId, {
      respect: gains.respect,
      affection: gains.affection,
    })
    this.faction = clampFaction(this.faction + gains.faction)
    // Идентификатор навыка приходит из данных, поэтому его проверяют:
    // опечатка в каталоге не должна ни падать, ни качать пустоту.
    if (gains.skill && isSkillId(gains.skill.id)) {
      this.trainSkill(gains.skill.id, gains.skill.amount)
    }
    // Поле effects.grade — оценка за выступление на семинаре. В разговоре
    // в коридоре ставить её некуда: она появится вместе с самим семинаром.

    dialogue.reply = option.reply
    return option.reply
  }

  /** Закрывает окно разговора. */
  endDialogue(): void {
    this.activeDialogue = null
  }

  /* ---------------------------------------------------------------- */
  /* Многошаговые сцены                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Начинает многошаговую сцену.
   *
   * Условия те же, что у короткого разговора, плюс два своих: сцена может
   * быть привязана к помещению и может быть одноразовой. «Марей в туалете»
   * и то и другое — встретиться там можно только по-настоящему встретившись,
   * а поймать одного и того же человека у одной и той же раковины дважды
   * означало бы уже не случайность, а засаду.
   *
   * Возвращает false, если сцены нет, собеседника нет рядом, помещение
   * не то или сцена уже сыграна.
   */
  startChainDialogue(chainId: string): boolean {
    if (!this.canStartChain(chainId)) return false

    const entry = this.chains[chainId]
    const npc = entry ? this.speakerOf(entry.chain.speakerId) : undefined
    // Проверку прошли выше; здесь только достаём то, что она уже нашла.
    if (!entry || !npc) return false

    // Заговорив, персонаж останавливается: уходить от собеседника
    // посреди собственной реплики он не должен.
    stopActor(this.player)
    this.activeInteraction = null
    this.activeDialogue = null

    const context = this.dialogueContext(npc.id)
    const talk = new Conversation(entry.chain, context, { skillLabels: SKILL_LABELS })
    const node = talk.start()
    this.markNodeVisited(node.id)

    this.activeChain = {
      chainId,
      npcId: npc.id,
      talk,
      context,
      node,
      line: node.prompt,
      introSeen: false,
      awaitingContinue: false,
      reply: null,
      consequence: null,
      outcome: null,
    }
    return true
  }

  /**
   * Делает шаг разговора: применяет эффекты выбранной реплики и возвращает
   * ответ собеседника вместе с последствием.
   *
   * null — если сцены нет, реплика уже сказана, такой реплики в узле нет
   * или она игроку недоступна. Недоступную реплику мир отвергает молча:
   * интерфейс показывает её серой и не даёт нажать, а рухнуть посреди
   * сцены из-за подделанного нажатия она не должна.
   */
  chooseChainOption(optionId: string): ActiveChainInfo | null {
    const active = this.activeChain
    if (!active || active.awaitingContinue || active.node === null) return null

    const option = active.talk.currentOptions().find((item) => item.id === optionId)
    if (!option) return null

    const step = active.talk.choose(optionId)
    this.applyChainEffects(active.npcId, option.effects)
    // Узел, в который перешли, тоже пройден: концовка сцены — такой же узел,
    // и именно по ней потом узнают, чем у этих двоих всё кончилось.
    this.markNodeVisited(option.next)

    // Ответив, игрок завязку уже прочёл: держать её на экране до конца
    // сцены значит отнимать место у разговора.
    active.introSeen = true
    active.awaitingContinue = true
    active.reply = step.reply
    active.consequence = step.consequence

    if (step.outcome) {
      active.node = null
      active.line = step.outcome.finalLine
      active.outcome = step.outcome
      const moodletId = step.outcome.ending.moodletId
      if (moodletId) this.addMoodletById(moodletId)
      if (this.chains[active.chainId]?.once && !this.playedChains.includes(active.chainId)) {
        this.playedChains.push(active.chainId)
      }
    } else if (step.node) {
      active.node = step.node
      active.line = step.node.prompt
    }

    return this.activeChainInfo()
  }

  /**
   * Убирает реакцию собеседника и открывает следующий выбор — или итог,
   * если разговор кончился.
   */
  continueChainDialogue(): boolean {
    const active = this.activeChain
    if (!active || !active.awaitingContinue) return false
    active.awaitingContinue = false
    active.reply = null
    active.consequence = null
    return true
  }

  /** Закрывает окно сцены. Применённые эффекты никуда не деваются. */
  endChainDialogue(): void {
    this.activeChain = null
  }

  /** Сцены, которые можно завести прямо сейчас. Во время сцены — ни одной. */
  availableChains(): string[] {
    return Object.keys(this.chains).filter((chainId) => this.canStartChain(chainId))
  }

  /** Сцена, которую можно завести с этим человеком, или null. */
  chainForNpc(npcId: string): string | null {
    return (
      this.availableChains().find((chainId) => {
        const speakerId = this.chains[chainId]?.chain.speakerId
        return speakerId !== undefined && this.speakerOf(speakerId)?.id === npcId
      }) ?? null
    )
  }

  /**
   * Можно ли начать сцену, не начиная её.
   *
   * Отдельный метод, а не «попробовать и откатить»: интерфейс спрашивает
   * об этом каждый снимок, десять раз в секунду, и заводить ради вопроса
   * настоящий разговор было бы дорого и опасно.
   */
  private canStartChain(chainId: string): boolean {
    // Идущая сцена занимает игрока целиком: ни второй сцены, ни той же
    // самой заново, пока он не договорил.
    if (this.activeChain) return false

    const entry = this.chains[chainId]
    if (!entry) return false
    if (entry.once && this.playedChains.includes(chainId)) return false

    const npc = this.speakerOf(entry.chain.speakerId)
    if (!npc) return false
    if (!this.isWithinReach(npc)) return false

    const room = this.currentRoom
    return entry.room === undefined || entry.room === room
  }

  /**
   * Стоят ли игрок и этот житель этажа достаточно близко, чтобы говорить.
   *
   * Условий два, и оба нужны. Помещение отсекает разговоры через стену:
   * два метра по прямой могут оказаться дверью, косяком и чужой аудиторией.
   * Расстояние отсекает разговоры через весь коридор: помещение длиной
   * в двадцать два метра — всё ещё одно помещение.
   */
  private isWithinReach(npc: Npc): boolean {
    const room = this.currentRoom
    if (room === null || npcRoom(this.grid, npc) !== room) return false
    return isWithinTalkRange(this.player.position, npc.actor.position)
  }

  /**
   * Применяет эффекты реплики цепочки — теми же правилами, что и короткий
   * разговор: прирост уважения проходит через близость взглядов, потеря —
   * в полном размере, навык через общий замедлитель прокачки.
   *
   * Романтическое измерение цепочек в мир пока не приходит: оно включится
   * вместе с однокурсниками. У преподавателей его нет и быть не может —
   * за этим следит validateChain, см. sim/social/Romance.ts.
   */
  private applyChainEffects(npcId: string, effects: ChainEffects): void {
    const multiplier = respectMultiplier(this.teacherFor(npcId), this.faction)
    const gains = resolveEffects(effects, multiplier)

    this.relationships.adjust(npcId, {
      respect: gains.respect,
      affection: gains.affection,
    })
    this.faction = clampFaction(this.faction + gains.faction)
    if (gains.skill && isSkillId(gains.skill.id)) {
      this.trainSkill(gains.skill.id, gains.skill.amount)
    }
    if (effects.moodletId) this.addMoodletById(effects.moodletId)
  }

  /**
   * Реплики узла глазами игрока: и доступные, и закрытые.
   *
   * Закрытые не прячутся, а показываются с подсказкой, чего для них
   * не хватает. Спрятанная реплика — это реплика, которой для игрока
   * не существует: он никогда не узнает, что латынь открывала здесь
   * отдельную ветку, и решит, что сцена маленькая. Серая строка
   * «нужны древние языки» говорит обратное — сцена больше, чем вы к ней
   * готовы, — и это ровно то, ради чего в игре вообще учатся.
   */
  private chainOptionInfo(active: ActiveChain): ChainOptionInfo[] {
    const node = active.node
    if (!node) return []
    return node.options.map((option) => {
      const available = option.requires
        ? isAvailable(option.requires, active.context)
        : true
      return {
        id: option.id,
        text: option.text,
        tone: option.tone,
        toneLabel: TONE_LABELS[option.tone],
        toneHint: toneHint(option.tone),
        available,
        lockHint: available
          ? null
          : describeRequirement(option.requires, this.requirementLabels),
      }
    })
  }

  private activeChainInfo(): ActiveChainInfo | null {
    const active = this.activeChain
    if (!active) return null

    const outcome = active.outcome
    return {
      chainId: active.chainId,
      npcId: active.npcId,
      speakerId: active.talk.speakerId,
      intro: active.introSeen ? null : (active.talk.intro ?? null),
      nodeId: active.node?.id ?? null,
      prompt: active.awaitingContinue ? null : active.line,
      options: active.awaitingContinue ? [] : this.chainOptionInfo(active),
      awaitingContinue: active.awaitingContinue,
      reply: active.reply,
      consequence: active.consequence
        ? {
            reason: active.consequence.reason,
            text: active.consequence.text,
            changes: active.consequence.changes,
          }
        : null,
      outcome: outcome
        ? {
            endingId: outcome.ending.id,
            title: outcome.report.title,
            summary: outcome.report.summary,
            closing: outcome.report.closing,
            changes: outcome.report.changes,
          }
        : null,
    }
  }

  /* ---------------------------------------------------------------- */
  /* Семинар                                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Выступление на семинаре — главное учебное действие игры.
   *
   * Здесь сходится всё сразу: прочитанное превращается в оценку, оценка —
   * в уважение преподавателя, выбранный способ говорить — в сдвиг по шкале
   * традиций, а вся сцена — в реплику, которую преподаватель произносит
   * своими словами.
   *
   * Отказ возвращается с причиной, а не молча: игрок должен понимать,
   * почему кнопка не сработала, — «Сейчас не семинар», «Вы не в той
   * аудитории», «Вы уже выступали».
   */
  commandSpeakAtSeminar(optionId: string): SeminarOutcome {
    const study = this.study
    const lesson = this.currentSeminarLesson()
    const block = this.seminarBlock(lesson)
    if (block !== null || !study || !lesson) {
      return { ok: false, reason: SEMINAR_REFUSALS[block ?? 'notSeminar'] }
    }

    const teacher = this.teacherOfCourse(lesson.courseId)
    const npcId = this.npcOfTeacher(teacher)
    const context = this.dialogueContext(npcId ?? '')

    const option = study.seminarOptions.find((item) => item.id === optionId)
    if (!option) return { ok: false, reason: SEMINAR_REFUSALS.unknownOption }
    if (!isSeminarOptionAvailable(option, context)) {
      return { ok: false, reason: SEMINAR_REFUSALS.lockedOption }
    }

    const result = performSpeech({
      option,
      skills: this.skills,
      courseSkills: study.config.courses[lesson.courseId]?.skillIds ?? [],
      mood: this.mood,
      affinity: this.affinityWith(teacher),
      teacherPosition: teacher?.factionPosition ?? 0,
    })

    const occurrence = occurrenceId(this.clock.time.day, lesson.id)
    study.speakAt(occurrence, lesson.courseId, result.grade)
    if (npcId !== null && result.respect !== 0) {
      this.relationships.adjust(npcId, { respect: result.respect })
    }
    this.faction = clampFaction(this.faction + result.factionShift)
    for (const gain of result.skillGains) this.trainSkill(gain.id, gain.amount)
    this.addMoodletById(result.moodletId)

    const lines = teacher ? (result.success ? teacher.lines.praise : teacher.lines.rebuke) : []
    const speech: SeminarSpeechInfo = {
      occurrenceId: occurrence,
      courseId: lesson.courseId,
      optionId: option.id,
      teacherId: teacher?.id ?? null,
      grade: result.grade,
      success: result.success,
      reply: pickLine(lines, `${occurrence}:${option.id}:${result.grade}`),
    }
    this.lastSpeech = speech
    return { ok: true, speech }
  }

  /** Убирает ответ преподавателя с экрана. Оценка при этом никуда не девается. */
  dismissSeminarSpeech(): void {
    this.lastSpeech = null
  }

  /** Семинар, идущий прямо сейчас, или null. Лекция сюда не попадает. */
  private currentSeminarLesson(): Lesson | null {
    if (!this.study) return null
    const { day, minutes } = this.clock.time
    const lesson = lessonAt(this.study.config.schedule, day, minutes)
    return lesson && lesson.kind === 'seminar' ? lesson : null
  }

  /** Что мешает выступить прямо сейчас. null — ничто не мешает. */
  private seminarBlock(lesson: Lesson | null): SeminarRefusal | null {
    const study = this.study
    if (!study) return 'notSeminar'
    // Отметка и выступление ищутся по сегодняшней паре, а не по строке
    // расписания: прошлый понедельник ни на что не даёт права.
    const occurrence = lesson ? occurrenceId(this.clock.time.day, lesson.id) : null
    return seminarRefusal({
      lesson,
      room: this.currentRoom,
      mark: occurrence ? study.attendance.markFor(occurrence) : null,
      alreadySpoke: occurrence ? study.hasSpokenAt(occurrence) : false,
    })
  }

  /** Преподаватель, который ведёт этот курс, или undefined. */
  private teacherOfCourse(courseId: string): Teacher | undefined {
    const course = this.study?.config.courses[courseId]
    return course ? this.teachers[course.teacherId] : undefined
  }

  /** Житель этажа, за которым стоит этот преподаватель, или null. */
  private npcOfTeacher(teacher: Teacher | undefined): string | null {
    if (!teacher) return null
    return this.npcs.find((npc) => npc.teacherId === teacher.id)?.id ?? null
  }

  /** Насколько игрок «свой» для этого преподавателя, −1..1. Чужому — ноль влияния. */
  private affinityWith(teacher: Teacher | undefined): number {
    if (!teacher) return 0
    return affinity(teacher.factionPosition, teacher.factionTolerance, this.faction)
  }

  /* ---------------------------------------------------------------- */
  /* Сохранение и загрузка                                             */
  /* ---------------------------------------------------------------- */

  /**
   * Снимает состояние мира целиком — всё, что игрок нажил.
   *
   * Каталоги сюда не идут: планировка, предметы, курсы, преподаватели
   * и тексты сцен приходят из content при запуске и одинаковы в любой
   * партии. В сохранение попадает только то, чем один проход отличается
   * от другого. Схему и версию держит sim/save/SaveGame.ts.
   */
  captureState(): WorldState {
    return {
      clock: this.clock.toJSON(),
      needs: { ...this.needs },
      skills: { ...this.skills },
      faction: this.faction,
      moodlets: this.moodlets.toJSON(),
      player: { position: { ...this.player.position }, facing: this.player.facing },
      npcs: this.npcManager.toJSON(),
      activeInteraction: cloneData(this.activeInteraction),
      relationships: this.relationships.toJSON(),
      readBooks: [...this.readBooks],
      visitedNodes: [...this.visitedNodes],
      playedChains: [...this.playedChains],
      lastSpeech: cloneData(this.lastSpeech),
      study: this.study?.toJSON() ?? null,
      day: {
        summary: cloneData(this.daySummary),
        weekendPending: this.weekendPending,
        weekendReport: cloneData(this.weekendReport),
        epilogue: cloneData(this.epilogue),
        baseline: cloneData(this.dayBaseline),
        stressSum: this.stressSum,
        awakeMinutes: this.awakeMinutes,
      },
    }
  }

  /**
   * Возвращает мир в сохранённое состояние.
   *
   * Журналы и списки не подменяются новыми объектами, а перезаполняются
   * на месте: часы, отношения, модификаторы и учебное состояние розданы
   * наружу по ссылке — рендер и панели держат их у себя, и подменённый
   * объект остался бы у них старым.
   *
   * Разговор при загрузке закрывается: почему именно так — в WorldState.
   */
  restoreState(state: WorldState): void {
    this.clock.load(state.clock)
    this.needs = { ...state.needs }
    this.skills = { ...state.skills }
    this.faction = state.faction
    this.moodlets.load(state.moodlets)

    this.player.position = { ...state.player.position }
    this.player.facing = state.player.facing
    // Путь обрывается: сохранён не маршрут, а место, где человек стоит.
    stopActor(this.player)
    this.npcManager.load(state.npcs)

    this.activeInteraction = cloneData(state.activeInteraction)
    this.relationships.load(state.relationships)
    this.readBooks = [...state.readBooks]
    this.visitedNodes = [...state.visitedNodes]
    this.playedChains = [...state.playedChains]
    this.lastSpeech = cloneData(state.lastSpeech)
    // Мир без учёбы и сохранение без учёбы — это разные сборки одной игры,
    // а не разное состояние одной. Такое сохранение молча проходит мимо
    // журналов: подставлять их некуда, и падать здесь не за что.
    if (this.study && state.study) this.study.load(state.study)

    this.daySummary = cloneData(state.day.summary)
    this.weekendPending = state.day.weekendPending
    this.weekendReport = cloneData(state.day.weekendReport)
    this.epilogue = cloneData(state.day.epilogue)
    this.dayBaseline = cloneData(state.day.baseline)
    this.stressSum = state.day.stressSum
    this.awakeMinutes = state.day.awakeMinutes

    this.activeDialogue = null
    this.activeChain = null
  }

  /** Отмечает книгу прочитанной. Перечитывание ничего не меняет. */
  markBookRead(bookId: string): void {
    if (!this.readBooks.includes(bookId)) this.readBooks.push(bookId)
  }

  /**
   * Запоминает, что игрок прошёл через этот узел разговора.
   * Второй проход по тому же узлу ничего не добавляет: память отвечает
   * на вопрос «было ли», а не «сколько раз».
   */
  markNodeVisited(nodeId: string): void {
    if (!this.visitedNodes.includes(nodeId)) this.visitedNodes.push(nodeId)
  }

  /** Был ли у игрока разговор, проходящий через этот узел. */
  hasVisitedNode(nodeId: string): boolean {
    return this.visitedNodes.includes(nodeId)
  }

  /**
   * Собеседник среди жителей этажа.
   *
   * Данные называют собеседника то преподавателем, то жителем этажа —
   * узел написан голосом «marey», а ходит по коридору «teacher-marey», —
   * поэтому ищем по обоим идентификаторам.
   */
  private speakerOf(speakerId: string): Npc | undefined {
    return this.npcs.find((npc) => npc.teacherId === speakerId || npc.id === speakerId)
  }

  /** Преподаватель, стоящий за этим NPC, или undefined, если это не он. */
  private teacherFor(npcId: string): Teacher | undefined {
    const teacherId = this.npcManager.find(npcId)?.teacherId
    return teacherId ? this.teachers[teacherId] : undefined
  }

  /**
   * Всё, что нужно, чтобы решить, какие реплики игроку доступны.
   *
   * Снимок, а не окно наружу: списки копируются. Контекст снимается один
   * раз, в начале разговора, и живёт до его конца — реплики, появляющиеся
   * и пропадающие на глазах у игрока от его же собственного выбора,
   * читались бы как сбой.
   */
  private dialogueContext(npcId: string): DialogueContext {
    return {
      skills: this.skills,
      faction: this.faction,
      relationship: this.relationships.get(npcId),
      readBooks: [...this.readBooks],
      moodlets: this.moodlets.active(this.clock.totalMinutes).map((item) => item.id),
      visitedNodes: [...this.visitedNodes],
      day: this.clock.time.day,
    }
  }

  applyNeeds(delta: Partial<Needs>): void {
    this.needs = applyNeedDelta(this.needs, delta)
  }

  /** Начисляет прирост навыка с учётом замедления на высоких уровнях. */
  trainSkill(id: SkillId, amount: number): void {
    this.skills = gainSkill(this.skills, id, amount)
  }

  /** Вешает модификатор настроения, отсчитывая срок от текущей минуты. */
  addMoodlet(spec: MoodletSpec): void {
    this.moodlets.add(moodletFrom(spec, this.clock.totalMinutes))
  }

  /**
   * Вешает модификатор по идентификатору из каталога.
   * Возвращает false, если такого в каталоге нет: мир без каталога
   * должен молча работать, а не падать.
   */
  addMoodletById(moodletId: string): boolean {
    const spec = this.moodletCatalog[moodletId]
    if (!spec) return false
    this.addMoodlet(spec)
    return true
  }

  /**
   * Ставит отметки о посещении по тому, где стоит персонаж.
   * Вызывается из tick: посещаемость — следствие поведения игрока,
   * а не отдельной команды.
   */
  private updateAttendance(): void {
    const study = this.study
    if (!study) return

    const { day, minutes } = this.clock.time
    const decisions = decideAttendance({
      schedule: study.config.schedule,
      day,
      minutes,
      room: this.currentRoom,
      markFor: (id) => study.attendance.markFor(id),
    })

    for (const decision of decisions) {
      study.attendLesson(decision.occurrenceId, decision.courseId, decision.mark)
    }
  }

  private currentLessonInfo(day: number, minutes: number): CurrentLessonInfo | null {
    if (!this.study) return null
    const lesson = lessonAt(this.study.config.schedule, day, minutes)
    if (!lesson) return null
    return { courseId: lesson.courseId, room: lesson.room, kind: lesson.kind }
  }

  private nextLessonInfo(day: number, minutes: number): NextLessonInfo | null {
    if (!this.study) return null
    const lesson = nextLessonOnDay(this.study.config.schedule, day, minutes)
    if (!lesson) return null
    const period = periodOf(lesson.period)
    if (!period) return null
    return {
      courseId: lesson.courseId,
      room: lesson.room,
      startsInMinutes: period.startMinutes - minutes,
    }
  }

  snapshot(): WorldSnapshot {
    const { day, minutes } = this.clock.time
    const seminar = this.seminarInfo()
    return {
      day,
      minutes,
      timeLabel: this.clock.formatTime(),
      // Подпись берётся у календаря, а не у часов: часы умеют считать
      // недели, но не знают ни про сессию, ни про конец модуля, — и после
      // последнего дня честно объявили бы «Неделя 8, понедельник».
      dayLabel: describeDay(day),
      speed: this.clock.speed,
      needs: this.needs,
      mood: this.mood,
      skills: this.skills,
      activeMoodlets: this.moodlets
        .active(this.clock.totalMinutes)
        .map(({ id, label, mood }) => ({ id, label, mood })),
      playerPosition: { ...this.player.position },
      playerFacing: this.player.facing,
      isPlayerMoving: isMoving(this.player),
      activity: this.activeInteraction?.label ?? null,
      currentRoom: this.currentRoom,
      currentLesson: this.currentLessonInfo(day, minutes),
      nextLesson: this.nextLessonInfo(day, minutes),
      npcs: this.npcManager.snapshot(),
      faction: this.faction,
      factionLabel: factionLabel(this.faction),
      relationships: this.relationshipInfo(),
      activeDialogue: this.activeDialogueInfo(),
      activeChain: this.activeChainInfo(),
      availableChains: this.availableChains(),
      canSpeakAtSeminar: seminar?.canSpeak ?? false,
      seminar,
      minutesUntilCurfew: minutesUntilCurfew(minutes),
      dayScreen: this.dayScreenInfo(),
    }
  }

  /**
   * Семинар для интерфейса.
   *
   * Панель появляется, только когда игрок сидит на семинаре: в коридоре
   * под дверью выступать не с чем, а лишняя панель в углу экрана
   * превращается в мебель, которую перестают читать.
   */
  private seminarInfo(): SeminarInfo | null {
    const study = this.study
    const lesson = this.currentSeminarLesson()
    if (!study || !lesson || this.currentRoom !== lesson.room) return null

    const teacher = this.teacherOfCourse(lesson.courseId)
    const context = this.dialogueContext(this.npcOfTeacher(teacher) ?? '')
    const block = this.seminarBlock(lesson)

    return {
      courseId: lesson.courseId,
      lessonId: lesson.id,
      teacherId: teacher?.id ?? null,
      canSpeak: block === null,
      reason: block === null ? null : SEMINAR_REFUSALS[block],
      options: availableSeminarOptions(study.seminarOptions, context).map(
        ({ id, label, hint }) => ({ id, label, hint }),
      ),
      speech:
        this.lastSpeech?.occurrenceId === occurrenceId(this.clock.time.day, lesson.id)
          ? this.lastSpeech
          : null,
    }
  }

  private relationshipInfo(): RelationshipInfo[] {
    return this.npcs.map((npc) => {
      const { affection, respect } = this.relationships.get(npc.id)
      return {
        npcId: npc.id,
        teacherId: npc.teacherId,
        affection,
        respect,
        label: this.relationships.describeFor(npc.id),
      }
    })
  }

  private activeDialogueInfo(): ActiveDialogueInfo | null {
    const dialogue = this.activeDialogue
    if (!dialogue) return null
    return {
      nodeId: dialogue.node.id,
      npcId: dialogue.npcId,
      speakerId: dialogue.node.speakerId,
      prompt: dialogue.node.prompt,
      options: dialogue.options.map(({ id, text }) => ({ id, text })),
      reply: dialogue.reply,
    }
  }

  private advanceInteraction(gameMinutes: number): void {
    const active = this.activeInteraction
    if (!active) return
    // Пока персонаж идёт к предмету, действие не выполняется.
    if (isMoving(this.player)) return

    active.remainingMinutes -= gameMinutes
    if (active.remainingMinutes <= 0) {
      this.applyNeeds(active.needDelta)
      if (active.moodletId) this.addMoodletById(active.moodletId)
      const sleepSpotKind = active.sleepSpotKind
      this.activeInteraction = null

      // Персонаж улёгся — дальше начинается ночь, а не следующее действие.
      if (sleepSpotKind !== null) {
        const spot = this.sleepSpots[sleepSpotKind]
        if (spot) this.beginSleep(spot)
      }
    }
  }
}
