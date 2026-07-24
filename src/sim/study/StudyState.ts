import { AttendanceLog, type AttendanceCounts, type AttendanceMark } from './Attendance'
import { PASSING_GRADE, type Course, type CourseCatalog } from './Course'
import { EssayJournal, type EssayTask } from './Essay'
import { Gradebook } from './Gradebook'
import type { Schedule } from './Schedule'

export interface StudyConfig {
  courses: CourseCatalog
  schedule: Schedule
  essays: EssayTask[]
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

  constructor(config: StudyConfig) {
    this.config = config
  }

  attendLesson(lessonId: string, courseId: string, mark: AttendanceMark): void {
    this.attendance.mark(lessonId, courseId, mark)
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

  /** Эссе, которые ещё не сданы, отсортированные по близости срока. */
  pendingEssays(currentDay: number): EssayTask[] {
    return this.config.essays
      .filter((task) => !this.essays.progressFor(task.id)?.submitted)
      .filter((task) => task.dueDay >= currentDay - 7)
      .sort((a, b) => a.dueDay - b.dueDay)
  }
}
