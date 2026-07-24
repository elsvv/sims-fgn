/** Вдоль какой оси вытянут отрезок стены. */
export type WallAxis = 'x' | 'z'

/**
 * Сплошной кусок стены — несколько клеток подряд, которые можно нарисовать
 * одним растянутым боксом вместо цепочки кубиков.
 */
export interface WallSegment {
  /** Ключ группы, к которой принадлежат все клетки отрезка. */
  key: string
  /** Клетка, с которой отрезок начинается. */
  col: number
  row: number
  /** Длина в клетках вдоль оси. */
  length: number
  axis: WallAxis
}

/**
 * Сетка клеток стен, размеченная по группам.
 *
 * Группа — это всё, что обязано совпадать у клеток одного меша. Сейчас это
 * высота: срезанную стену нельзя слить с целой, иначе перегородка по пояс
 * вырастет до потолка. Слой рендера сам решает, что считать группой, —
 * здесь важно только то, что клетки с разными ключами не сливаются.
 */
export interface WallGrid {
  cols: number
  rows: number
  /** Ключ группы клетки или null, если это не стена. */
  keyAt: (col: number, row: number) => string | null
}

function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

/**
 * Разбивает стены на минимальное число отрезков без нахлёстов.
 *
 * Сначала слева направо собираются горизонтальные полосы: только они дают
 * выигрыш длиной больше клетки. Полоса из одной клетки не выпускается —
 * такая клетка достаётся вертикальному проходу, где может оказаться частью
 * длинного простенка. Всё, что горизонтальный проход уже покрыл, второй
 * проход пропускает, поэтому каждая клетка стены попадает ровно в один
 * отрезок: покрытие полное, пересечений нет.
 */
export function buildWallSegments(grid: WallGrid): WallSegment[] {
  const segments: WallSegment[] = []
  const covered = new Set<string>()

  for (let row = 0; row < grid.rows; row++) {
    let col = 0
    while (col < grid.cols) {
      const key = grid.keyAt(col, row)
      if (key === null) {
        col++
        continue
      }

      let length = 1
      while (col + length < grid.cols && grid.keyAt(col + length, row) === key) length++

      if (length > 1) {
        segments.push({ key, col, row, length, axis: 'x' })
        for (let i = 0; i < length; i++) covered.add(cellKey(col + i, row))
      }
      col += length
    }
  }

  for (let col = 0; col < grid.cols; col++) {
    let row = 0
    while (row < grid.rows) {
      const key = grid.keyAt(col, row)
      if (key === null || covered.has(cellKey(col, row))) {
        row++
        continue
      }

      let length = 1
      while (
        row + length < grid.rows &&
        grid.keyAt(col, row + length) === key &&
        !covered.has(cellKey(col, row + length))
      ) {
        length++
      }

      segments.push({ key, col, row, length, axis: 'z' })
      row += length
    }
  }

  return segments
}

/** Клетки, которые покрывает отрезок. Нужна рендеру и тестам покрытия. */
export function wallSegmentCells(segment: WallSegment): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = []
  for (let i = 0; i < segment.length; i++) {
    cells.push(
      segment.axis === 'x'
        ? { col: segment.col + i, row: segment.row }
        : { col: segment.col, row: segment.row + i },
    )
  }
  return cells
}
