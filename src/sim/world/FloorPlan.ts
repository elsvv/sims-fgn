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
}
