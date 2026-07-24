import type { GridPos } from '../types'
import type { NavGrid } from '../world/NavGrid'

interface Node {
  pos: GridPos
  g: number
  f: number
  parent: string | null
}

const NEIGHBOURS: readonly GridPos[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
]

function key(pos: GridPos): string {
  return `${pos.col},${pos.row}`
}

function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

/**
 * Поиск пути A* по четырём направлениям.
 * Возвращает путь, включающий стартовую и конечную клетки, либо null.
 *
 * Диагонали намеренно запрещены: персонажи ходят по коридорам и между
 * партами, срезание углов по диагонали выглядит неправдоподобно.
 */
export function findPath(grid: NavGrid, from: GridPos, to: GridPos): GridPos[] | null {
  if (!grid.isWalkable(from) || !grid.isWalkable(to)) return null
  if (from.col === to.col && from.row === to.row) return [{ ...from }]

  const open = new Map<string, Node>()
  const closed = new Set<string>()
  const all = new Map<string, Node>()

  const start: Node = { pos: from, g: 0, f: manhattan(from, to), parent: null }
  open.set(key(from), start)
  all.set(key(from), start)

  while (open.size > 0) {
    let current: Node | null = null
    let currentKey = ''
    for (const [k, node] of open) {
      if (current === null || node.f < current.f) {
        current = node
        currentKey = k
      }
    }
    if (current === null) break

    if (current.pos.col === to.col && current.pos.row === to.row) {
      const path: GridPos[] = []
      let cursor: Node | undefined = current
      while (cursor) {
        path.unshift({ ...cursor.pos })
        cursor = cursor.parent ? all.get(cursor.parent) : undefined
      }
      return path
    }

    open.delete(currentKey)
    closed.add(currentKey)

    for (const offset of NEIGHBOURS) {
      const next: GridPos = {
        col: current.pos.col + offset.col,
        row: current.pos.row + offset.row,
      }
      const nextKey = key(next)
      if (closed.has(nextKey) || !grid.isWalkable(next)) continue

      const tentativeG = current.g + 1
      const existing = open.get(nextKey)
      if (existing && existing.g <= tentativeG) continue

      const node: Node = {
        pos: next,
        g: tentativeG,
        f: tentativeG + manhattan(next, to),
        parent: currentKey,
      }
      open.set(nextKey, node)
      all.set(nextKey, node)
    }
  }

  return null
}
