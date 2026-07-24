/** Минимальная положительная оценка. Ниже — академическая задолженность. */
export const PASSING_GRADE = 4

export const MAX_GRADE = 10

/** Допуск при сравнении суммы весов с единицей: 0.33 + 0.34 + 0.33 — нормальная формула ВШЭ. */
const WEIGHT_TOLERANCE = 0.011

export type AssessmentKind = 'seminar' | 'homework' | 'essay' | 'quiz' | 'exam'

/**
 * Элемент контроля. В ВШЭ формула результирующей оценки фиксируется
 * в программе дисциплины и объявляется студентам заранее.
 */
export interface Assessment {
  id: string
  /** Подпись в интерфейсе, на русском. */
  label: string
  /** Доля в итоговой оценке, 0..1. Сумма по курсу равна 1. */
  weight: number
  kind: AssessmentKind
  /**
   * Блокирующий элемент нельзя провалить: без него дисциплина не сдана
   * независимо от накопленной оценки. В философских программах почти всё
   * неблокирующее — можно завалить эссе и вытянуть семинарами.
   */
  blocking: boolean
}

export interface Course {
  id: string
  /** Полное название, как в учебном плане. */
  title: string
  /** Короткое название для расписания и плашек. */
  short: string
  teacherId: string
  assessments: Assessment[]
}

export type CourseCatalog = Record<string, Course>

/** Возвращает список человекочитаемых ошибок. Пустой список означает, что курс корректен. */
export function validateCourse(course: Course): string[] {
  const errors: string[] = []

  if (course.assessments.length === 0) {
    errors.push(`Курс «${course.title}»: нет ни одного элемента контроля`)
    return errors
  }

  const seen = new Set<string>()
  for (const assessment of course.assessments) {
    if (seen.has(assessment.id)) {
      errors.push(`Курс «${course.title}»: идентификатор «${assessment.id}» повторяется`)
    }
    seen.add(assessment.id)

    if (assessment.weight < 0) {
      errors.push(
        `Курс «${course.title}»: у элемента «${assessment.label}» отрицательный вес ${assessment.weight}`,
      )
    }
  }

  const total = course.assessments.reduce((sum, a) => sum + a.weight, 0)
  if (Math.abs(total - 1) > WEIGHT_TOLERANCE) {
    errors.push(`Курс «${course.title}»: сумма весов равна ${total.toFixed(3)}, а должна быть 1`)
  }

  return errors
}

export function findAssessment(course: Course, id: string): Assessment | undefined {
  return course.assessments.find((a) => a.id === id)
}
