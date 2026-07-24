import type { GridPos } from '../types'
import type { NavGrid } from '../world/NavGrid'

const APPROACH_OFFSETS: readonly GridPos[] = [
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: -1, row: 0 },
]

/**
 * Ищет клетку, с которой можно подойти к предмету.
 * Если клетка самого предмета проходима — встаём прямо на неё.
 */
export function findApproachCell(grid: NavGrid, target: GridPos): GridPos | null {
  if (grid.isWalkable(target)) return { ...target }
  for (const offset of APPROACH_OFFSETS) {
    const candidate = { col: target.col + offset.col, row: target.row + offset.row }
    if (grid.isWalkable(candidate)) return candidate
  }
  return null
}
