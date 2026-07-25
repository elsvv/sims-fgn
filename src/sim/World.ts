import {
  createActor,
  isMoving,
  setDestination,
  stepActor,
  stopActor,
  type Actor,
} from './actor/Actor'
import type { DialogueCatalog, DialogueContext, DialogueNode } from './dialogue/Dialogue'
import { findAdjacentCell, findApproachCell } from './interaction/approach'
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
import { createSkills, gainSkill, isSkillId, type SkillId, type Skills } from './player/Skills'
import {
  openDialogue,
  resolveEffects,
  respectMultiplier,
  type ActiveDialogue,
} from './social/Conversation'
import { affinity, clampFaction, factionLabel } from './social/Faction'
import { RelationshipMap } from './social/Relationship'
import type { Teacher, TeacherCatalog } from './social/Teacher'
import { decideAttendance } from './study/AttendanceTracker'
import {
  lessonAt,
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
import { GameClock, type Speed } from './time/GameClock'
import type { GridPos, Vec2 } from './types'
import type { FloorPlan } from './world/FloorPlan'
import { NavGrid } from './world/NavGrid'
import type { PropCatalog } from './world/PropDefinition'

/**
 * Максимальная длительность одного тика в реальных секундах.
 * Защищает от гигантского скачка после того, как вкладка была свёрнута.
 */
const MAX_TICK_SECONDS = 0.25

export interface ActiveInteraction {
  propId: string
  interactionId: string
  label: string
  /** Сколько игровых минут действия осталось. Тикает только когда персонаж дошёл. */
  remainingMinutes: number
  needDelta: Partial<Needs>
  /** Какой модификатор настроения повесить по завершении. null — никакого. */
  moodletId: string | null
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
}

const EMPTY_SOCIAL: SocialConfig = { teachers: {}, dialogues: {} }

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
  /** Можно ли выступить на семинаре прямо сейчас. */
  canSpeakAtSeminar: boolean
  /** Семинар, на котором игрок сидит, или null. */
  seminar: SeminarInfo | null
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
  /** Отношения со всеми, с кем игрок имел дело. Ключ — идентификатор NPC. */
  readonly relationships = new RelationshipMap()
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
  /**
   * Последнее выступление на семинаре. Живёт до конца той пары, на которой
   * состоялось: панель показывает ответ преподавателя, пока игрок сидит
   * в аудитории, и не тащит его в следующий день.
   */
  lastSpeech: SeminarSpeechInfo | null = null

  constructor(
    plan: FloorPlan,
    spawn: GridPos,
    catalog: PropCatalog = {},
    study: StudyState | null = null,
    moodletCatalog: MoodletCatalog = {},
    npcs: readonly NpcSpec[] = [],
    social: SocialConfig = EMPTY_SOCIAL,
  ) {
    this.plan = plan
    this.catalog = catalog
    this.study = study
    this.moodletCatalog = moodletCatalog
    this.teachers = social.teachers
    this.dialogues = social.dialogues
    this.grid = new NavGrid(plan)
    this.player = createActor('player', this.grid.gridToWorld(spawn))
    this.npcManager = new NpcManager(npcs, this.grid, study?.config.schedule ?? [])
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
    const delta = Math.min(realDeltaSeconds, MAX_TICK_SECONDS)
    const gameMinutes = this.clock.advance(delta)
    if (gameMinutes === 0) return

    const { day, minutes } = this.clock.time
    this.needs = decayNeeds(this.needs, gameMinutes)
    this.moodlets.prune(this.clock.totalMinutes)
    stepActor(this.player, this.grid, delta * this.clock.speed)
    this.npcManager.tick(this.grid, delta * this.clock.speed, day, minutes)
    this.advanceInteraction(gameMinutes)
    this.updateAttendance()
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
    }
    return true
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
   * стоит не там. Условие соседства — общее помещение: разговаривать через
   * стену нельзя, а гоняться за преподавателем по всему коридору незачем.
   */
  startDialogue(nodeId: string): boolean {
    const node = this.dialogues[nodeId]
    if (!node) return false

    const npc = this.speakerOf(node)
    if (!npc) return false

    const room = this.currentRoom
    if (room === null || npcRoom(this.grid, npc) !== room) return false

    // Заговорив, персонаж останавливается: разговаривать на ходу,
    // удаляясь от собеседника, он не должен.
    stopActor(this.player)
    this.activeInteraction = null
    this.activeDialogue = openDialogue(npc.id, node, this.dialogueContext(npc.id))
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

  /** Отмечает книгу прочитанной. Перечитывание ничего не меняет. */
  markBookRead(bookId: string): void {
    if (!this.readBooks.includes(bookId)) this.readBooks.push(bookId)
  }

  /** Собеседник узла среди жителей этажа. */
  private speakerOf(node: DialogueNode): Npc | undefined {
    return this.npcs.find(
      (npc) => npc.teacherId === node.speakerId || npc.id === node.speakerId,
    )
  }

  /** Преподаватель, стоящий за этим NPC, или undefined, если это не он. */
  private teacherFor(npcId: string): Teacher | undefined {
    const teacherId = this.npcManager.find(npcId)?.teacherId
    return teacherId ? this.teachers[teacherId] : undefined
  }

  /** Всё, что нужно, чтобы решить, какие реплики игроку доступны. */
  private dialogueContext(npcId: string): DialogueContext {
    return {
      skills: this.skills,
      faction: this.faction,
      relationship: this.relationships.get(npcId),
      readBooks: this.readBooks,
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
      dayLabel: this.clock.formatDay(),
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
      canSpeakAtSeminar: seminar?.canSpeak ?? false,
      seminar,
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
      this.activeInteraction = null
    }
  }
}
