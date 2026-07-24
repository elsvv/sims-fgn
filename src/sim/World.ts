import { createActor, isMoving, setDestination, stepActor, type Actor } from './actor/Actor'
import { findApproachCell } from './interaction/approach'
import {
  applyNeedDelta,
  calculateMood,
  createNeeds,
  decayNeeds,
  type Needs,
} from './needs/needs'
import { decideAttendance } from './study/AttendanceTracker'
import { lessonAt, nextLessonOnDay, periodOf, type Lesson } from './study/Schedule'
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

export interface WorldSnapshot {
  day: number
  minutes: number
  timeLabel: string
  dayLabel: string
  speed: Speed
  needs: Needs
  mood: number
  playerPosition: Vec2
  playerFacing: number
  isPlayerMoving: boolean
  /** Подпись текущего занятия или null, если персонаж свободен. */
  activity: string | null
  /** Помещение, где стоит персонаж: «А-204», «коридор». null — в дверях или в стене. */
  currentRoom: string | null
  currentLesson: CurrentLessonInfo | null
  nextLesson: NextLessonInfo | null
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
  /** Учебное состояние. null — мир без учёбы: так собраны тесты движения и нужд. */
  readonly study: StudyState | null
  player: Actor
  needs: Needs = createNeeds()
  activeInteraction: ActiveInteraction | null = null

  constructor(
    plan: FloorPlan,
    spawn: GridPos,
    catalog: PropCatalog = {},
    study: StudyState | null = null,
  ) {
    this.plan = plan
    this.catalog = catalog
    this.study = study
    this.grid = new NavGrid(plan)
    this.player = createActor('player', this.grid.gridToWorld(spawn))
  }

  get mood(): number {
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

    this.needs = decayNeeds(this.needs, gameMinutes)
    stepActor(this.player, this.grid, delta * this.clock.speed)
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
    }
    return true
  }

  applyNeeds(delta: Partial<Needs>): void {
    this.needs = applyNeedDelta(this.needs, delta)
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
      markFor: (lessonId) => study.attendance.markFor(lessonId),
    })

    for (const decision of decisions) {
      study.attendLesson(decision.lessonId, decision.courseId, decision.mark)
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
    return {
      day,
      minutes,
      timeLabel: this.clock.formatTime(),
      dayLabel: this.clock.formatDay(),
      speed: this.clock.speed,
      needs: this.needs,
      mood: this.mood,
      playerPosition: { ...this.player.position },
      playerFacing: this.player.facing,
      isPlayerMoving: isMoving(this.player),
      activity: this.activeInteraction?.label ?? null,
      currentRoom: this.currentRoom,
      currentLesson: this.currentLessonInfo(day, minutes),
      nextLesson: this.nextLessonInfo(day, minutes),
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
      this.activeInteraction = null
    }
  }
}
