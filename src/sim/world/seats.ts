import type { FloorPlan } from './FloorPlan'
import type { PropCatalog } from './PropDefinition'

/**
 * Где на этаже можно сидеть.
 *
 * Правило одно и очень простое: человек сидит, если он стоит на клетке
 * со стулом и никуда не идёт. Ни состояния, ни команды «сесть» для этого
 * не нужно — как и в жизни, сесть значит дойти до стула и остановиться.
 * Поэтому и работает одинаково для всех: игрок, дошедший до парты по
 * действию «Сесть и слушать», и преподаватель, оказавшийся на том же
 * стуле, садятся одним и тем же кодом.
 *
 * Живёт в sim, а не в рендере, по той же причине, что и остальная
 * планировка: где стоит стул и куда он повёрнут — свойство мира.
 * Рисующий слой отсюда берёт готовые числа.
 */

/** Место, на котором сидят: где, куда лицом и на какой высоте. */
export interface SeatSpot {
  /** Клетка сиденья. */
  col: number
  row: number
  /** Направление взгляда сидящего, atan2(dz, dx) — как facing у актора. */
  facing: number
  /** Высота сиденья над полом в метрах. */
  height: number
}

/** Ключ клетки в карте сидений. */
export function seatKey(col: number, row: number): string {
  return `${col},${row}`
}

/**
 * Куда смотрит сидящий на предмете с таким поворотом.
 *
 * «Перёд» модели набора — это +Z (см. content/props/propCatalog.ts), а
 * поворот размещения доворачивает его вокруг вертикали. Значит, в мире
 * предмет смотрит в (sin r, cos r) по осям (x, z), и сидящий вместе с ним.
 * Стул в аудитории повёрнут на пол-оборота — спинкой к двери, лицом
 * к доске, — и сидящий смотрит на доску, с какой бы стороны он ни подошёл.
 */
export function seatFacing(rotation: number): number {
  return Math.atan2(Math.cos(rotation), Math.sin(rotation))
}

/**
 * Все сиденья этажа по клеткам.
 *
 * Считается один раз при создании мира: предметы на этаже не двигаются,
 * а спрашивают об этой карте каждый кадр и на каждого человека.
 */
export function buildSeatMap(plan: FloorPlan, catalog: PropCatalog): Map<string, SeatSpot> {
  const seats = new Map<string, SeatSpot>()
  for (const placement of plan.props) {
    const seat = catalog[placement.kind]?.seat
    if (!seat) continue
    seats.set(seatKey(placement.col, placement.row), {
      col: placement.col,
      row: placement.row,
      facing: seatFacing(placement.rotation),
      height: seat.height,
    })
  }
  return seats
}
