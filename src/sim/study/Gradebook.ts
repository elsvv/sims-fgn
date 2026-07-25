import { MAX_GRADE, PASSING_GRADE, type AssessmentKind, type Course } from './Course'

/**
 * Элементы контроля, которые игра действительно проводит.
 *
 * Список нужен ровно одному месту — подведению итогов модуля. Экзамены,
 * контрольные и домашние задания объявлены в настоящих формулах ВШЭ, но
 * своих механик пока не имеют, и считать их несданными было бы враньём:
 * студент не проваливал экзамен, экзамена не было. Поэтому непроведённые
 * элементы выпадают из формулы, а веса оставшихся нормируются.
 *
 * Когда появится сессия, сюда добавится 'exam' — и больше ничего.
 */
export const HELD_ASSESSMENT_KINDS: readonly AssessmentKind[] = ['seminar']

/** Арифметическое округление к ближайшему целому с зажимом в 0..10. */
export function roundGrade(value: number): number {
  const rounded = Math.round(value)
  return Math.min(MAX_GRADE, Math.max(0, rounded))
}

/** Сырые оценки: courseId -> assessmentId -> 0..10. */
export type GradeRecords = Record<string, Record<string, number>>

/**
 * Журнал оценок студента.
 *
 * Главный метод — maxAchievable: он отвечает на вопрос «какой максимум
 * мне ещё светит». В ВШЭ пересдаётся только экзаменационная часть,
 * накопленная не меняется, поэтому забитый модуль арифметически
 * невозможно вытянуть — и игрок должен видеть это заранее, а не узнать
 * на пересдаче.
 */
export class Gradebook {
  private records: GradeRecords = {}

  record(courseId: string, assessmentId: string, grade: number): void {
    const course = this.records[courseId] ?? {}
    course[assessmentId] = roundGrade(grade)
    this.records[courseId] = course
  }

  gradeFor(courseId: string, assessmentId: string): number | null {
    return this.records[courseId]?.[assessmentId] ?? null
  }

  isGraded(courseId: string, assessmentId: string): boolean {
    return this.gradeFor(courseId, assessmentId) !== null
  }

  /**
   * Накопленная оценка: взвешенное среднее по уже выставленным элементам,
   * кроме экзамена, нормированное на их суммарный вес.
   */
  accumulated(course: Course): number {
    let sum = 0
    let weight = 0
    for (const assessment of course.assessments) {
      if (assessment.kind === 'exam') continue
      const grade = this.gradeFor(course.id, assessment.id)
      if (grade === null) continue
      sum += grade * assessment.weight
      weight += assessment.weight
    }
    return weight === 0 ? 0 : sum / weight
  }

  /** Максимальный итог, который ещё достижим: невыставленное считается десяткой. */
  maxAchievable(course: Course): number {
    let sum = 0
    for (const assessment of course.assessments) {
      const grade = this.gradeFor(course.id, assessment.id)
      sum += (grade ?? MAX_GRADE) * assessment.weight
    }
    return roundGrade(sum)
  }

  isComplete(course: Course): boolean {
    return course.assessments.every((a) => this.isGraded(course.id, a.id))
  }

  /** Итоговая оценка или null, если выставлено не всё. */
  finalGrade(course: Course): number | null {
    if (!this.isComplete(course)) return null
    let sum = 0
    for (const assessment of course.assessments) {
      sum += (this.gradeFor(course.id, assessment.id) ?? 0) * assessment.weight
    }
    return roundGrade(sum)
  }

  /**
   * Оценка, с которой дисциплина уходит в итог модуля.
   *
   * От finalGrade отличается тем, что не ждёт полной ведомости: элементы,
   * которых игра не проводила, выпадают из формулы, а из проведённых
   * невыставленное считается нулём. Невыставленное — это несданное эссе
   * и семинар, на котором студент за шесть недель не сказал ни слова:
   * и то и другое честно стоит ноль.
   *
   * null означает, что оценивать пока не по чему: ни один элемент контроля
   * этой дисциплины в игре ещё не проводится.
   */
  settledGrade(course: Course, heldKinds: readonly AssessmentKind[]): number | null {
    let sum = 0
    let weight = 0
    for (const assessment of course.assessments) {
      if (!heldKinds.includes(assessment.kind)) continue
      sum += (this.gradeFor(course.id, assessment.id) ?? 0) * assessment.weight
      weight += assessment.weight
    }
    if (weight === 0) return null
    return roundGrade(sum / weight)
  }

  isPassed(course: Course): boolean {
    const final = this.finalGrade(course)
    if (final === null) return false
    if (final < PASSING_GRADE) return false

    // Блокирующий элемент нельзя провалить, какой бы ни была арифметика.
    for (const assessment of course.assessments) {
      if (!assessment.blocking) continue
      const grade = this.gradeFor(course.id, assessment.id)
      if (grade === null || grade < PASSING_GRADE) return false
    }
    return true
  }

  toJSON(): GradeRecords {
    return JSON.parse(JSON.stringify(this.records)) as GradeRecords
  }

  /**
   * Возвращает состояние на место, в уже существующий журнал.
   *
   * Нужно там, где журнал заменить нельзя: учебное состояние держит его
   * своим полем и раздаёт наружу, а подменять объект под теми, кто уже
   * взял на него ссылку, — верный способ разъехаться с самим собой.
   */
  load(records: GradeRecords): void {
    this.records = JSON.parse(JSON.stringify(records)) as GradeRecords
  }

  static fromJSON(records: GradeRecords): Gradebook {
    const book = new Gradebook()
    book.load(records)
    return book
  }
}
