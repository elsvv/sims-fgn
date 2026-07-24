/** Наборы реплик преподавателя на типовые ситуации. */
export interface TeacherLines {
  greeting: string[]
  praise: string[]
  rebuke: string[]
  lateArrival: string[]
  examPass: string[]
  examFail: string[]
}

export interface Teacher {
  id: string
  /** Фамилия для расписания и плашек. */
  short: string
  /** Полное имя с отчеством, как к нему обращаются. */
  name: string
  courseIds: string[]
  /** Позиция на шкале философских традиций, −100..100. */
  factionPosition: number
  /** Насколько широко он терпит расхождение. Чем меньше, тем жёстче. */
  factionTolerance: number
  lines: TeacherLines
}

export type TeacherCatalog = Record<string, Teacher>
