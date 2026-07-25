import { createActor, isMoving, setDestination, stepActor, type Actor } from '../actor/Actor'
import { lessonsOnDay, periodOf, type Lesson, type Schedule } from '../study/Schedule'
import type { GridPos, Vec2 } from '../types'
import type { NavGrid } from '../world/NavGrid'

/**
 * За сколько игровых минут до звонка преподаватель выходит к аудитории.
 *
 * Величина не декоративная: персонаж идёт со скоростью 1.4 м/с
 * масштабированного времени, а игровая минута — это две трети такой секунды.
 * Значит, за минуту игрового времени человек проходит меньше метра, и путь
 * с дальнего конца коридора в дальний угол аудитории стоит около двадцати
 * пяти минут. Полчаса — это запас, при котором преподаватель стоит у доски
 * к звонку, а не входит в дверь вместе с ним.
 */
export const ARRIVE_BEFORE_MINUTES = 30

/**
 * Житель этажа. Актор отвечает за положение и путь, всё остальное —
 * ссылки на данные: кто это и где он обитает между парами.
 *
 * teacherId равен null у тех, кто преподавателем не является: студенты
 * появятся позже, и менеджеру они достанутся без единой правки.
 */
export interface Npc {
  id: string
  actor: Actor
  /** Идентификатор в каталоге преподавателей или null. */
  teacherId: string | null
  /** Помещение, где персонаж проводит время, когда у него нет пары. */
  homeRoom: string
}

/** Описание NPC для менеджера. Позиция вычисляется, а не задаётся. */
export interface NpcSpec {
  id: string
  teacherId: string | null
  /**
   * Курсы, которые персонаж ведёт. По ним занятие расписания опознаётся
   * как своё: расписание знает про курс, а про преподавателя — нет.
   */
  courseIds: readonly string[]
  homeRoom: string
}

/** NPC в снимке состояния мира: всё, что нужно, чтобы его нарисовать. */
export interface NpcSnapshot {
  id: string
  teacherId: string | null
  position: Vec2
  facing: number
  isMoving: boolean
}

function samePos(a: GridPos, b: GridPos): boolean {
  return a.col === b.col && a.row === b.row
}

/** Проходимые клетки помещения, сверху вниз и слева направо. */
export function roomCells(grid: NavGrid, roomId: string): GridPos[] {
  const cells: GridPos[] = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const pos: GridPos = { col, row }
      if (!grid.isWalkable(pos)) continue
      if (grid.roomAt(pos)?.id !== roomId) continue
      cells.push(pos)
    }
  }
  return cells
}

/**
 * Место преподавателя среди клеток аудитории: передний ряд у доски,
 * ближе к середине.
 *
 * Передний ряд определяется по наименьшему номеру строки — доска в игре
 * висит на дальней от коридора стене. Клетка самой доски непроходима,
 * поэтому преподаватель встаёт рядом с ней, а не внутри неё.
 */
function frontCell(grid: NavGrid, cells: readonly GridPos[]): GridPos | null {
  const first = cells[0]
  if (!first) return null

  const room = grid.roomAt(first)
  const centre = room ? (room.col0 + room.col1) / 2 : first.col

  let best = first
  let bestOffset = Math.abs(first.col - centre)
  for (const cell of cells) {
    // Строка важнее столбца: сначала передний ряд, потом уже середина ряда.
    const offset = Math.abs(cell.col - centre)
    if (cell.row < best.row || (cell.row === best.row && offset < bestOffset)) {
      best = cell
      bestOffset = offset
    }
  }
  return best
}

/** Место, на котором преподаватель ведёт занятие в этом помещении. */
export function teachingSpot(grid: NavGrid, roomId: string): GridPos | null {
  return frontCell(grid, roomCells(grid, roomId))
}

/** Помещение, в котором стоит NPC, или null. */
export function npcRoom(grid: NavGrid, npc: Npc): string | null {
  return grid.roomAt(grid.worldToGrid(npc.actor.position))?.id ?? null
}

/**
 * Жители этажа и их распорядок.
 *
 * Правило поведения одно и целиком выводится из расписания: если у персонажа
 * скоро или прямо сейчас пара — он идёт в её аудиторию и остаётся там до
 * звонка; в остальное время возвращается на своё место в «домашнем»
 * помещении. Никакого состояния «идёт на пару» не хранится — цель считается
 * заново от времени, поэтому перемотка времени и пауза ничего не ломают.
 */
export class NpcManager {
  private readonly items: Npc[] = []
  private readonly schedule: Schedule
  /** Курсы каждого NPC: id NPC → идентификаторы курсов. */
  private readonly courses = new Map<string, readonly string[]>()
  /** Постоянное место в домашнем помещении. */
  private readonly homeCells = new Map<string, GridPos>()
  /** Клетка, к которой NPC отправлен сейчас. Нужна, чтобы не искать путь заново каждый кадр. */
  private readonly goals = new Map<string, GridPos>()
  private readonly cellCache = new Map<string, GridPos[]>()

  constructor(specs: readonly NpcSpec[], grid: NavGrid, schedule: Schedule = []) {
    this.schedule = schedule

    const total = new Map<string, number>()
    for (const spec of specs) {
      total.set(spec.homeRoom, (total.get(spec.homeRoom) ?? 0) + 1)
    }

    const placed = new Map<string, number>()
    for (const spec of specs) {
      const index = placed.get(spec.homeRoom) ?? 0
      placed.set(spec.homeRoom, index + 1)

      const home = this.homeCellFor(grid, spec.homeRoom, index, total.get(spec.homeRoom) ?? 1)
      this.homeCells.set(spec.id, home)
      this.courses.set(spec.id, spec.courseIds)
      this.items.push({
        id: spec.id,
        actor: createActor(spec.id, grid.gridToWorld(home)),
        teacherId: spec.teacherId,
        homeRoom: spec.homeRoom,
      })
    }
  }

  get list(): readonly Npc[] {
    return this.items
  }

  find(id: string): Npc | undefined {
    return this.items.find((npc) => npc.id === id)
  }

  /** Куда персонаж идёт прямо сейчас. Для тестов и отладки. */
  goalOf(id: string): GridPos | null {
    return this.goals.get(id) ?? null
  }

  /**
   * Двигает всех NPC.
   * @param scaledSeconds реальные секунды, умноженные на скорость игры.
   */
  tick(grid: NavGrid, scaledSeconds: number, day: number, minutes: number): void {
    for (const npc of this.items) {
      const lesson = this.lessonFor(npc, day, minutes)
      const target = this.targetFor(npc, grid, lesson)
      if (target) {
        const goal = this.goals.get(npc.id)
        if (!goal || !samePos(goal, target)) {
          this.goals.set(npc.id, target)
          setDestination(npc.actor, grid, target)
        }
      }
      stepActor(npc.actor, grid, scaledSeconds)

      // Дошедший преподаватель разворачивается к аудитории. Иначе он
      // остаётся стоять так, как шёл, — то есть лицом в доску и спиной
      // к тем, кому читает.
      if (lesson && !isMoving(npc.actor)) this.faceRoom(grid, npc, lesson.room)
    }
  }

  snapshot(): NpcSnapshot[] {
    return this.items.map((npc) => ({
      id: npc.id,
      teacherId: npc.teacherId,
      position: { ...npc.actor.position },
      facing: npc.actor.facing,
      isMoving: isMoving(npc.actor),
    }))
  }

  /**
   * Занятие, ради которого персонаж сейчас должен быть в аудитории:
   * то, что идёт, или то, до которого осталось меньше получаса.
   */
  lessonFor(npc: Npc, day: number, minutes: number): Lesson | null {
    const courses = this.courses.get(npc.id)
    if (!courses || courses.length === 0) return null

    for (const lesson of lessonsOnDay(this.schedule, day)) {
      if (!courses.includes(lesson.courseId)) continue
      const period = periodOf(lesson.period)
      if (!period) continue
      if (minutes < period.startMinutes - ARRIVE_BEFORE_MINUTES) continue
      if (minutes >= period.endMinutes) continue
      return lesson
    }
    return null
  }

  private targetFor(npc: Npc, grid: NavGrid, lesson: Lesson | null): GridPos | null {
    if (lesson) {
      const spot = frontCell(grid, this.cellsOf(grid, lesson.room))
      if (spot) return spot
    }
    return this.homeCells.get(npc.id) ?? null
  }

  /** Разворачивает персонажа лицом к середине помещения. */
  private faceRoom(grid: NavGrid, npc: Npc, roomId: string): void {
    const first = this.cellsOf(grid, roomId)[0]
    if (!first) return
    const room = grid.roomAt(first)
    if (!room) return

    const centre = grid.gridToWorld({
      col: Math.round((room.col0 + room.col1) / 2),
      row: Math.round((room.row0 + room.row1) / 2),
    })
    const dx = centre.x - npc.actor.position.x
    const dz = centre.z - npc.actor.position.z
    // Стоя ровно в середине комнаты, разворачиваться некуда.
    if (Math.sqrt(dx * dx + dz * dz) < 0.25) return
    npc.actor.facing = Math.atan2(dz, dx)
  }

  /**
   * Место NPC в домашнем помещении. Места раздаются с равными промежутками
   * по всему помещению: шесть преподавателей, стоящих в одной клетке
   * коридора, выглядели бы одним человеком с шестью подписями.
   */
  private homeCellFor(
    grid: NavGrid,
    roomId: string,
    index: number,
    total: number,
  ): GridPos {
    const cells = this.cellsOf(grid, roomId)
    if (cells.length === 0) return this.anyWalkableCell(grid)

    const slot = Math.min(
      cells.length - 1,
      Math.floor(((index + 0.5) * cells.length) / Math.max(1, total)),
    )
    return cells[slot] ?? cells[0] ?? { col: 0, row: 0 }
  }

  /** Запасной вариант для NPC, чьё помещение на этаже не построено. */
  private anyWalkableCell(grid: NavGrid): GridPos {
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const pos: GridPos = { col, row }
        if (grid.isWalkable(pos)) return pos
      }
    }
    return { col: 0, row: 0 }
  }

  private cellsOf(grid: NavGrid, roomId: string): GridPos[] {
    const cached = this.cellCache.get(roomId)
    if (cached) return cached
    const cells = roomCells(grid, roomId)
    this.cellCache.set(roomId, cells)
    return cells
  }
}
