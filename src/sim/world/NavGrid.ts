import type { GridPos, Vec2 } from '../types'
import type { FloorPlan, TileKind } from './FloorPlan'

const WALKABLE: ReadonlySet<TileKind> = new Set<TileKind>(['floor', 'door'])

export class NavGrid {
  readonly cols: number
  readonly rows: number
  readonly cellSize: number

  private readonly tiles: TileKind[][]
  private readonly blocked: Set<string>

  constructor(plan: FloorPlan) {
    this.cellSize = plan.cellSize
    this.rows = plan.tiles.length
    this.cols = plan.tiles.reduce((max, row) => Math.max(max, row.length), 0)

    this.tiles = plan.tiles.map((line) => {
      const row: TileKind[] = []
      for (let col = 0; col < this.cols; col++) {
        const char = line[col] ?? ' '
        row.push(plan.legend[char] ?? 'void')
      }
      return row
    })

    this.blocked = new Set(
      plan.props.filter((p) => p.blocks).map((p) => `${p.col},${p.row}`),
    )
  }

  inBounds(pos: GridPos): boolean {
    return pos.col >= 0 && pos.col < this.cols && pos.row >= 0 && pos.row < this.rows
  }

  tileAt(pos: GridPos): TileKind {
    if (!this.inBounds(pos)) return 'void'
    return this.tiles[pos.row]?.[pos.col] ?? 'void'
  }

  isWalkable(pos: GridPos): boolean {
    if (!this.inBounds(pos)) return false
    if (this.blocked.has(`${pos.col},${pos.row}`)) return false
    return WALKABLE.has(this.tileAt(pos))
  }

  /** Центр клетки в метрах. */
  gridToWorld(pos: GridPos): Vec2 {
    return {
      x: (pos.col + 0.5) * this.cellSize,
      z: (pos.row + 0.5) * this.cellSize,
    }
  }

  worldToGrid(point: Vec2): GridPos {
    return {
      col: Math.floor(point.x / this.cellSize),
      row: Math.floor(point.z / this.cellSize),
    }
  }
}
