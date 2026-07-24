import { describe, expect, it } from 'vitest'
import { findAssessment, validateCourse, type Course } from './Course'

const GREEK: Course = {
  id: 'greek',
  title: 'Древнегреческий язык',
  short: 'Греческий',
  teacherId: 'alieva',
  assessments: [
    { id: 'classwork', label: 'Работа на занятиях', weight: 0.3, kind: 'seminar', blocking: false },
    { id: 'quizzes', label: 'Экспресс-контрольные', weight: 0.3, kind: 'quiz', blocking: false },
    { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
  ],
}

describe('Course', () => {
  it('принимает корректный курс', () => {
    expect(validateCourse(GREEK)).toEqual([])
  })

  it('ругается, если веса не дают единицу', () => {
    const broken: Course = {
      ...GREEK,
      assessments: [{ ...GREEK.assessments[0]!, weight: 0.5 }, GREEK.assessments[1]!],
    }
    const errors = validateCourse(broken)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.join(' ')).toContain('вес')
  })

  it('прощает погрешность чисел с плавающей точкой', () => {
    const thirds: Course = {
      ...GREEK,
      assessments: [
        { id: 'a', label: 'Домашние задания', weight: 0.33, kind: 'homework', blocking: false },
        { id: 'b', label: 'Работа на семинарах', weight: 0.34, kind: 'seminar', blocking: false },
        { id: 'c', label: 'Финальное эссе', weight: 0.33, kind: 'essay', blocking: false },
      ],
    }
    expect(validateCourse(thirds)).toEqual([])
  })

  it('ругается на пустой список элементов контроля', () => {
    expect(validateCourse({ ...GREEK, assessments: [] }).length).toBeGreaterThan(0)
  })

  it('ругается на повторяющиеся идентификаторы', () => {
    const dup: Course = {
      ...GREEK,
      assessments: [
        { id: 'x', label: 'Раз', weight: 0.5, kind: 'quiz', blocking: false },
        { id: 'x', label: 'Два', weight: 0.5, kind: 'quiz', blocking: false },
      ],
    }
    expect(validateCourse(dup).join(' ')).toContain('повторя')
  })

  it('ругается на отрицательный вес', () => {
    const neg: Course = {
      ...GREEK,
      assessments: [
        { id: 'x', label: 'Раз', weight: -0.5, kind: 'quiz', blocking: false },
        { id: 'y', label: 'Два', weight: 1.5, kind: 'quiz', blocking: false },
      ],
    }
    expect(neg.assessments.length).toBe(2)
    expect(validateCourse(neg).join(' ')).toContain('вес')
  })

  it('находит элемент контроля по идентификатору', () => {
    expect(findAssessment(GREEK, 'exam')?.label).toBe('Экзамен')
    expect(findAssessment(GREEK, 'нет')).toBeUndefined()
  })
})
