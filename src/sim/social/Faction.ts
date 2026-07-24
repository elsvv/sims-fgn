/** Крайние точки шкалы философских традиций. */
export const ANALYTIC = -100
export const CONTINENTAL = 100

export function clampFaction(value: number): number {
  return Math.min(CONTINENTAL, Math.max(ANALYTIC, value))
}

export function factionLabel(value: number): string {
  if (value <= -70) return 'Убеждённый аналитик'
  if (value <= -30) return 'Скорее аналитик'
  if (value < 30) return 'Ещё не определился'
  if (value < 70) return 'Скорее континентальный'
  return 'Континентальный до мозга костей'
}

/**
 * Насколько студент «свой» для преподавателя.
 * 1 — попал точно в позицию, 0 — на границе допуска, отрицательное — чужой.
 *
 * Именно поэтому всеобщим любимцем стать нельзя: приблизившись к одному
 * полюсу, неизбежно отдаляешься от другого.
 */
export function affinity(position: number, tolerance: number, playerValue: number): number {
  const safeTolerance = Math.max(1, tolerance)
  const distance = Math.abs(position - playerValue)
  return Math.max(-1, 1 - distance / safeTolerance)
}

/**
 * Множитель к приросту уважения.
 * Даже полный чужак может заслужить уважение — просто вчетверо медленнее.
 */
export function affinityBonus(affinityValue: number): number {
  return 0.25 + (affinityValue + 1) * 0.625
}
