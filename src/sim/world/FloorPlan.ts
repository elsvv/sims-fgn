export type TileKind = 'void' | 'floor' | 'wall' | 'door'

/** Размещение предмета обстановки на этаже. */
export interface PropPlacement {
  /** Уникальный в пределах этажа идентификатор. */
  id: string
  /** Ключ определения предмета в каталоге. */
  kind: string
  col: number
  row: number
  /** Поворот вокруг вертикальной оси в радианах. */
  rotation: number
  /** Делает ли предмет свою клетку непроходимой. По умолчанию false. */
  blocks?: boolean
}

/**
 * Помещение этажа: прямоугольник клеток с номером или названием.
 * Через него расписание связывается с миром — занятие в «А-204»
 * засчитывается, только если персонаж стоит внутри этого прямоугольника.
 *
 * Границы включительные: клетка (col1, row1) принадлежит помещению.
 */
export interface RoomDef {
  /** То, чем помещение называют: «А-204», «коридор». Совпадает с полем room у занятий. */
  id: string
  /** Подпись для интерфейса: «Аудитория А-204». */
  name: string
  col0: number
  row0: number
  col1: number
  row1: number
}

/**
 * Планировка этажа. Единственный источник правды и для геометрии,
 * и для навигации — расхождение между видимым и проходимым исключено
 * по построению.
 */
export interface FloorPlan {
  id: string
  name: string
  /** Размер клетки в метрах. */
  cellSize: number
  /** Соответствие символов планировки типам клеток. */
  legend: Record<string, TileKind>
  /** Строки планировки, сверху вниз. Каждый символ — одна клетка. */
  tiles: readonly string[]
  props: readonly PropPlacement[]
  /** Помещения этажа. Не должны пересекаться и выходить за планировку. */
  rooms: readonly RoomDef[]
}

/** Размер планировки в клетках. */
export function planSize(plan: FloorPlan): { cols: number; rows: number } {
  return {
    cols: plan.tiles.reduce((max, line) => Math.max(max, line.length), 0),
    rows: plan.tiles.length,
  }
}

export function roomContains(room: RoomDef, col: number, row: number): boolean {
  return col >= room.col0 && col <= room.col1 && row >= room.row0 && row <= room.row1
}

function roomsOverlap(a: RoomDef, b: RoomDef): boolean {
  return a.col0 <= b.col1 && b.col0 <= a.col1 && a.row0 <= b.row1 && b.row0 <= a.row1
}

/**
 * Возвращает список ошибок в помещениях этажа. Пустой список означает,
 * что они корректны. Пересечения запрещены: клетка должна принадлежать
 * ровно одному помещению, иначе «где стоит игрок» перестаёт быть вопросом
 * с единственным ответом.
 */
export function validateRooms(plan: FloorPlan): string[] {
  const errors: string[] = []
  const { cols, rows } = planSize(plan)
  const seen = new Set<string>()

  for (const room of plan.rooms) {
    if (seen.has(room.id)) {
      errors.push(`Помещение ${room.id} описано дважды`)
    } else {
      seen.add(room.id)
    }

    if (room.col1 < room.col0 || room.row1 < room.row0) {
      errors.push(`У помещения ${room.id} границы вывернуты наизнанку`)
      continue
    }

    if (room.col0 < 0 || room.row0 < 0 || room.col1 >= cols || room.row1 >= rows) {
      errors.push(`Помещение ${room.id} выходит за границы планировки`)
    }
  }

  for (let i = 0; i < plan.rooms.length; i++) {
    for (let j = i + 1; j < plan.rooms.length; j++) {
      const a = plan.rooms[i]
      const b = plan.rooms[j]
      if (!a || !b) continue
      if (a.col1 < a.col0 || a.row1 < a.row0 || b.col1 < b.col0 || b.row1 < b.row0) continue
      if (roomsOverlap(a, b)) errors.push(`Помещения ${a.id} и ${b.id} пересекаются`)
    }
  }

  return errors
}
