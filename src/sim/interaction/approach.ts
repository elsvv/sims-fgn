import type { GridPos, Vec2 } from '../types'
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
  return findAdjacentCell(grid, target)
}

/**
 * Ищет проходимую клетку рядом с целевой, никогда не возвращая саму целевую.
 *
 * Нужно, когда вставать в клетку нельзя, даже если она проходима:
 * к человеку подходят, а не встают в него. Разница с findApproachCell
 * ровно в этом — та встаёт на цель, если может.
 *
 * @param prefer необязательный отбор: подходящая клетка берётся первой,
 * а любая другая проходимая остаётся запасным вариантом. Так к человеку
 * в коридоре подходят по коридору, а не через стену в соседнюю аудиторию.
 */
export function findAdjacentCell(
  grid: NavGrid,
  target: GridPos,
  prefer?: (cell: GridPos) => boolean,
): GridPos | null {
  let fallback: GridPos | null = null
  for (const offset of APPROACH_OFFSETS) {
    const candidate = { col: target.col + offset.col, row: target.row + offset.row }
    if (!grid.isWalkable(candidate)) continue
    if (!prefer || prefer(candidate)) return candidate
    fallback ??= candidate
  }
  return fallback
}

/**
 * На каком расстоянии друг от друга можно заговорить, в метрах.
 *
 * Одного помещения мало: коридор второго этажа — двадцать два метра, и
 * «мы в одном коридоре» ничего не говорит о том, слышим ли мы друг друга.
 * Три метра — это расстояние, на котором в помещении разговаривают, не
 * повышая голоса, и заодно запас на то, что собеседник переступил с ноги
 * на ногу, пока игрок нажимал.
 *
 * Стоять ближе игрок и не сможет: подойдя через commandApproachNpc, он
 * встаёт в соседнюю клетку, то есть примерно в метре.
 */
export const TALK_RANGE_METRES = 3

/** Достаточно ли близко стоят двое, чтобы разговаривать. */
export function isWithinTalkRange(
  a: Vec2,
  b: Vec2,
  range: number = TALK_RANGE_METRES,
): boolean {
  const dx = a.x - b.x
  const dz = a.z - b.z
  // Сравниваем квадраты: корень здесь не нужен, а вызывают это каждый снимок.
  return dx * dx + dz * dz <= range * range
}
