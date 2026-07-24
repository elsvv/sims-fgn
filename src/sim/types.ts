/** Точка на плоскости мира в метрах. Мир лежит в плоскости XZ, ось Y направлена вверх. */
export interface Vec2 {
  x: number
  z: number
}

/** Позиция в клетках навигационной сетки. */
export interface GridPos {
  col: number
  row: number
}

export function vec2(x: number, z: number): Vec2 {
  return { x, z }
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}
