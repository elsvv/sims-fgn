import {
  AttendanceLog,
  type AttendanceCounts,
  type AttendanceMark,
  type AttendanceRecords,
} from './Attendance'
import { PASSING_GRADE, type Course, type CourseCatalog } from './Course'
import { EssayJournal, type EssayRecords, type EssayTask } from './Essay'
import { Gradebook, type GradeRecords } from './Gradebook'
import type { Schedule } from './Schedule'
import type { SeminarOption } from './Seminar'

export interface StudyConfig {
  courses: CourseCatalog
  schedule: Schedule
  essays: EssayTask[]
  /**
   * Способы выступить на семинаре. Необязательны: мир без них работает,
   * просто выступать в нём нечем — так собраны тесты посещаемости.
   */
  seminarOptions?: readonly SeminarOption[]
}

/**
 * Учебное состояние в сохранении.
 *
 * Программы дисциплин, расписание и задания сюда не идут: это содержимое
 * каталога, оно приходит из content и одинаково у всех. В сохранении лежит
 * только то, что студент нажил сам, — оценки, отметки о посещении, ход
 * работы над эссе и сказанное на семинарах.
 */
export interface StudyStateData {
  grades: GradeRecords
  attendance: AttendanceRecords
  essays: EssayRecords
  /** Оценки за каждое выступление по дисциплинам: из них считается среднее. */
  seminarScores: Record<string, number[]>
  /** Пары, на которых игрок выступал, и оценка за каждое выступление. */
  spokenOccurrences: Record<string, number>
}

export interface CourseStatus {
  course: Course
  accumulated: number
  maxAchievable: number
  finalGrade: number | null
  isPassed: boolean
  attendance: AttendanceCounts
}

/**
 * Учебное состояние студента: журнал оценок, посещаемость, эссе.
 * World держит это отдельным полем и делегирует сюда, чтобы не разрастаться.
 */
export class StudyState {
  readonly config: StudyConfig
  readonly gradebook = new Gradebook()
  readonly attendance = new AttendanceLog()
  readonly essays = new EssayJournal()

  /** Накопленные оценки за выступления, чтобы усреднять их, а не перезаписывать. */
  private seminarScores: Record<string, number[]> = {}

  /**
   * Пары, на которых игрок уже выступал, и оценка за каждое выступление.
   * Ключ — конкретная состоявшаяся пара (occurrenceId в Schedule): дважды
   * за одну пару слова не дают, а на следующей неделе тот же семинар
   * начинается с чистого листа.
   *
   * Оценка хранится рядом с фактом выступления, а не только в журнале:
   * в журнал уходит среднее за модуль, а итогам дня нужно знать, что было
   * сказано именно сегодня и чем это кончилось.
   */
  private spokenOccurrences: Record<string, number> = {}

  constructor(config: StudyConfig) {
    this.config = config
  }

  /** @param occurrenceId конкретная состоявшаяся пара: день плюс слот расписания. */
  attendLesson(occurrenceId: string, courseId: string, mark: AttendanceMark): void {
    this.attendance.mark(occurrenceId, courseId, mark)
  }

  /** Способы выступить на семинаре. Пустой список — выступать нечем. */
  get seminarOptions(): readonly SeminarOption[] {
    return this.config.seminarOptions ?? []
  }

  hasSpokenAt(occurrenceId: string): boolean {
    return this.spokenOccurrences[occurrenceId] !== undefined
  }

  /** Оценка за выступление на этой паре или null, если игрок промолчал. */
  gradeAt(occurrenceId: string): number | null {
    return this.spokenOccurrences[occurrenceId] ?? null
  }

  /** Сколько раз за модуль игрок открывал рот на семинаре. */
  get spokenCount(): number {
    return Object.keys(this.spokenOccurrences).length
  }

  /**
   * Записывает выступление на конкретной паре: оценка идёт в журнал,
   * а пара помечается — второй раз за неё слова не дают.
   *
   * Повторный вызов с той же парой не делает ничего. Защиту обещает сам
   * метод, поэтому он же обязан её и дать: пометить пару, но всё равно
   * записать оценку — значит впустить второй балл в среднее за модуль.
   * Мир до этого не доводит (см. seminarRefusal), но метод, который
   * держится только на осторожности вызывающего, — это не защита.
   */
  speakAt(occurrenceId: string, courseId: string, grade: number): void {
    if (this.hasSpokenAt(occurrenceId)) return
    this.spokenOccurrences[occurrenceId] = grade
    this.recordSeminar(courseId, grade)
  }

  /**
   * Записывает результат выступления. Оценка за семинарскую работу —
   * среднее по всем выступлениям за модуль.
   */
  recordSeminar(courseId: string, grade: number): void {
    const course = this.config.courses[courseId]
    if (!course) return

    const assessment = course.assessments.find((a) => a.kind === 'seminar')
    if (!assessment) return

    const scores = this.seminarScores[courseId] ?? []
    scores.push(grade)
    this.seminarScores[courseId] = scores

    const average = scores.reduce((sum, value) => sum + value, 0) / scores.length
    this.gradebook.record(courseId, assessment.id, average)
  }

  statusFor(courseId: string): CourseStatus | null {
    const course = this.config.courses[courseId]
    if (!course) return null
    return {
      course,
      accumulated: this.gradebook.accumulated(course),
      maxAchievable: this.gradebook.maxAchievable(course),
      finalGrade: this.gradebook.finalGrade(course),
      isPassed: this.gradebook.isPassed(course),
      attendance: this.attendance.countByCourse(courseId),
    }
  }

  allStatuses(): CourseStatus[] {
    return Object.keys(this.config.courses)
      .map((id) => this.statusFor(id))
      .filter((status): status is CourseStatus => status !== null)
  }

  /** Средний балл по завершённым курсам или null, если ни один ещё не закрыт. */
  gpa(): number | null {
    const finals = this.allStatuses()
      .map((status) => status.finalGrade)
      .filter((grade): grade is number => grade !== null)

    if (finals.length === 0) return null
    return finals.reduce((sum, grade) => sum + grade, 0) / finals.length
  }

  /** Курсы с академической задолженностью. */
  debts(): string[] {
    return this.allStatuses()
      .filter((status) => status.finalGrade !== null && status.finalGrade < PASSING_GRADE)
      .map((status) => status.course.id)
  }

  toJSON(): StudyStateData {
    return {
      grades: this.gradebook.toJSON(),
      attendance: this.attendance.toJSON(),
      essays: this.essays.toJSON(),
      seminarScores: JSON.parse(JSON.stringify(this.seminarScores)) as Record<string, number[]>,
      spokenOccurrences: { ...this.spokenOccurrences },
    }
  }

  /**
   * Возвращает сохранённое состояние на место.
   *
   * Журналы не подменяются, а перезаполняются: мир держит учебное состояние
   * своим полем, а панели расписания и семинара берут журналы у него
   * напрямую, — подменённый объект остался бы у них старым.
   */
  load(data: StudyStateData): void {
    this.gradebook.load(data.grades)
    this.attendance.load(data.attendance)
    this.essays.load(data.essays)
    this.seminarScores = JSON.parse(JSON.stringify(data.seminarScores)) as Record<
      string,
      number[]
    >
    this.spokenOccurrences = { ...data.spokenOccurrences }
  }

  static fromJSON(config: StudyConfig, data: StudyStateData): StudyState {
    const state = new StudyState(config)
    state.load(data)
    return state
  }

  /** Эссе, которые ещё не сданы, отсортированные по близости срока. */
  pendingEssays(currentDay: number): EssayTask[] {
    return this.config.essays
      .filter((task) => !this.essays.progressFor(task.id)?.submitted)
      .filter((task) => task.dueDay >= currentDay - 7)
      .sort((a, b) => a.dueDay - b.dueDay)
  }
}
