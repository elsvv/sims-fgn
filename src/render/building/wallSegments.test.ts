import { describe, expect, it } from 'vitest'
import { buildWallSegments, wallSegmentCells, type WallGrid } from './wallSegments'

/**
 * Собирает сетку из строк: `#` — стена, всё прочее — не стена.
 * Второй аргумент задаёт группу клетки, если в проверке важно,
 * что разные группы не сливаются.
 */
function gridFromRows(
  rows: readonly string[],
  key: (col: number, row: number) => string = () => 'wall',
): WallGrid {
  return {
    cols: rows.reduce((max, line) => Math.max(max, line.length), 0),
    rows: rows.length,
    keyAt: (col, row) => ((rows[row]?.[col] ?? ' ') === '#' ? key(col, row) : null),
  }
}

/** Все клетки стен сетки, в виде ключей вида "col,row". */
function wallCells(grid: WallGrid): Set<string> {
  const cells = new Set<string>()
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.keyAt(col, row) !== null) cells.add(`${col},${row}`)
    }
  }
  return cells
}

const ROOM = ['#####', '#...#', '#...#', '#####']

describe('сборка стен в отрезки', () => {
  it('отрезки покрывают ровно все клетки стен и не пересекаются', () => {
    const grid = gridFromRows(ROOM)
    const segments = buildWallSegments(grid)

    const covered: string[] = []
    for (const segment of segments) {
      for (const cell of wallSegmentCells(segment)) covered.push(`${cell.col},${cell.row}`)
    }

    expect(new Set(covered), 'покрытие разошлось с планировкой').toEqual(wallCells(grid))
    expect(covered.length, 'какая-то клетка покрыта дважды').toBe(new Set(covered).size)
  })

  it('то же самое на планировке с проёмами и внутренними перегородками', () => {
    const grid = gridFromRows([
      '##########',
      '#...####.#',
      '#.#.#..#.#',
      '#.#.#..#.#',
      '##.###.###',
      '#........#',
      '##########',
    ])
    const segments = buildWallSegments(grid)

    const covered: string[] = []
    for (const segment of segments) {
      for (const cell of wallSegmentCells(segment)) covered.push(`${cell.col},${cell.row}`)
    }

    expect(new Set(covered)).toEqual(wallCells(grid))
    expect(covered.length).toBe(new Set(covered).size)
  })

  it('сплошная стена становится одним отрезком, а не цепочкой кубиков', () => {
    const segments = buildWallSegments(gridFromRows(['#####']))
    expect(segments).toEqual([{ key: 'wall', col: 0, row: 0, length: 5, axis: 'x' }])
  })

  it('вертикальный простенок собирается вдоль столбца', () => {
    const segments = buildWallSegments(gridFromRows(['#', '#', '#']))
    expect(segments).toEqual([{ key: 'wall', col: 0, row: 0, length: 3, axis: 'z' }])
  })

  it('в комнате остаётся четыре отрезка вместо четырнадцати кубиков', () => {
    const segments = buildWallSegments(gridFromRows(ROOM))
    expect(segments.length).toBe(4)
    expect(wallCells(gridFromRows(ROOM)).size).toBe(14)
  })

  it('одиночная клетка тоже становится отрезком', () => {
    const segments = buildWallSegments(gridFromRows(['...', '.#.', '...']))
    expect(segments).toEqual([{ key: 'wall', col: 1, row: 1, length: 1, axis: 'z' }])
  })

  it('клетки разных групп не сливаются', () => {
    // Стена в пять клеток, у которой левая половина срезана, а правая целая:
    // слить их в один бокс нельзя, иначе перегородка вырастет до потолка.
    const segments = buildWallSegments(
      gridFromRows(['#####'], (col) => (col < 2 ? 'cut' : 'tall')),
    )
    expect(segments).toEqual([
      { key: 'cut', col: 0, row: 0, length: 2, axis: 'x' },
      { key: 'tall', col: 2, row: 0, length: 3, axis: 'x' },
    ])
  })

  it('пустая планировка не даёт отрезков', () => {
    expect(buildWallSegments(gridFromRows(['...', '...']))).toEqual([])
    expect(buildWallSegments(gridFromRows([]))).toEqual([])
  })
})
