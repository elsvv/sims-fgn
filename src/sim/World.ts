import { createActor, isMoving, setDestination, stepActor, type Actor } from './actor/Actor'
import { findApproachCell } from './interaction/approach'
import {
  applyNeedDelta,
  calculateMood,
  createNeeds,
  decayNeeds,
  type Needs,
} from './needs/needs'
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
  player: Actor
  needs: Needs = createNeeds()
  activeInteraction: ActiveInteraction | null = null

  constructor(plan: FloorPlan, spawn: GridPos, catalog: PropCatalog = {}) {
    this.plan = plan
    this.catalog = catalog
    this.grid = new NavGrid(plan)
    this.player = createActor('player', this.grid.gridToWorld(spawn))
  }

  get mood(): number {
    return calculateMood(this.needs)
  }

  /** @param realDeltaSeconds время, прошедшее с прошлого кадра. */
  tick(realDeltaSeconds: number): void {
    const delta = Math.min(realDeltaSeconds, MAX_TICK_SECONDS)
    const gameMinutes = this.clock.advance(delta)
    if (gameMinutes === 0) return

    this.needs = decayNeeds(this.needs, gameMinutes)
    stepActor(this.player, this.grid, delta * this.clock.speed)
    this.advanceInteraction(gameMinutes)
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
