/**
 * Кумулятивный рейтинг.
 *
 * Дизайн-документ, раздел 5.1: «Рейтинг публичный. Место, средний балл,
 * перцентиль — твоё имя в списке видят все. Одновременно мотиватор
 * и источник тревоги».
 *
 * Механика простая до предела и намеренно такая: место считается сравнением
 * со средними баллами потока. Сам поток — данные (src/content), а не
 * случайные числа: рейтинг, который прыгает при каждом пересчёте, тревожит
 * не так, как рейтинг, в котором ты честно двадцать первый из двадцати пяти.
 */

export interface RatingPlace {
  /** Место в списке, начиная с первого. */
  place: number
  /** Сколько человек в потоке, считая игрока. */
  cohortSize: number
  /** Сколько процентов потока осталось ниже, 0..100. */
  percentile: number
  /** Средний балл игрока. */
  gpa: number
  /** Место словами: «верхняя треть потока». */
  label: string
}

/** Как место в списке называют вслух. */
export function ratingLabel(percentile: number): string {
  if (percentile >= 90) return 'вершина списка'
  if (percentile >= 66) return 'верхняя треть потока'
  if (percentile >= 34) return 'середина потока'
  if (percentile >= 10) return 'нижняя треть потока'
  return 'самый низ списка'
}

/**
 * Место игрока среди однокурсников.
 *
 * Равный балл ставит игрока выше: в спорном случае игра толкует сомнение
 * в его пользу, потому что рейтинг и без того тревожная вещь.
 */
export function rankAmong(gpa: number, cohort: readonly number[]): RatingPlace {
  const above = cohort.filter((value) => value > gpa).length
  const cohortSize = cohort.length + 1
  const place = above + 1
  const percentile =
    cohortSize <= 1 ? 100 : Math.round(((cohortSize - place) / (cohortSize - 1)) * 100)

  return { place, cohortSize, percentile, gpa, label: ratingLabel(percentile) }
}
