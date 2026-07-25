import { findPath } from '../nav/findPath'
import type { GridPos, Vec2 } from '../types'
import type { NavGrid } from '../world/NavGrid'

/** Скорость пешей ходьбы в метрах за секунду масштабированного времени. */
export const WALK_SPEED_MPS = 1.4

export interface Actor {
  id: string
  /** Положение в метрах в плоскости XZ. */
  position: Vec2
  /** Направление взгляда в радианах, atan2(dz, dx). */
  facing: number
  speed: number
  /** Путь в клетках. Пуст, когда актор стоит. */
  path: GridPos[]
  /** Индекс следующей клетки в path. */
  pathIndex: number
}

export function createActor(id: string, position: Vec2): Actor {
  return {
    id,
    position: { ...position },
    facing: 0,
    speed: WALK_SPEED_MPS,
    path: [],
    pathIndex: 0,
  }
}

export function isMoving(actor: Actor): boolean {
  return actor.pathIndex < actor.path.length
}

/** Обрывает путь: актор остаётся там, где стоит. */
export function stopActor(actor: Actor): void {
  actor.path = []
  actor.pathIndex = 0
}

/**
 * Прокладывает путь к целевой клетке.
 * Возвращает false, если идти некуда — путь не найден либо актор уже на месте.
 */
export function setDestination(actor: Actor, grid: NavGrid, target: GridPos): boolean {
  const from = grid.worldToGrid(actor.position)
  const path = findPath(grid, from, target)
  if (!path) {
    stopActor(actor)
    return false
  }

  // Первая клетка пути — та, в которой актор уже стоит, её пропускаем.
  actor.path = path
  actor.pathIndex = 1
  return isMoving(actor)
}

/**
 * Продвигает актора вдоль пути.
 * @param scaledSeconds реальные секунды, умноженные на скорость игры.
 */
export function stepActor(actor: Actor, grid: NavGrid, scaledSeconds: number): void {
  let budget = actor.speed * scaledSeconds

  while (budget > 0 && isMoving(actor)) {
    const targetCell = actor.path[actor.pathIndex]
    if (!targetCell) break

    const target = grid.gridToWorld(targetCell)
    const dx = target.x - actor.position.x
    const dz = target.z - actor.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < 1e-6) {
      actor.pathIndex++
      continue
    }

    actor.facing = Math.atan2(dz, dx)

    if (dist <= budget) {
      actor.position = { x: target.x, z: target.z }
      actor.pathIndex++
      budget -= dist
    } else {
      actor.position = {
        x: actor.position.x + (dx / dist) * budget,
        z: actor.position.z + (dz / dist) * budget,
      }
      budget = 0
    }
  }

  if (!isMoving(actor)) stopActor(actor)
}
