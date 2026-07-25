import { describe, expect, it } from 'vitest'
import { MAX_GRADE, PASSING_GRADE } from '../../sim/study/Course'
import { rankAmong } from '../../sim/study/Rating'
import { COHORT_GPA } from './cohort'

describe('поток для рейтинга', () => {
  it('это группа, а не толпа и не двое', () => {
    expect(COHORT_GPA.length).toBeGreaterThanOrEqual(15)
    expect(COHORT_GPA.length).toBeLessThanOrEqual(40)
  })

  it('все баллы внутри десятибалльной шкалы', () => {
    for (const gpa of COHORT_GPA) {
      expect(gpa).toBeGreaterThanOrEqual(0)
      expect(gpa).toBeLessThanOrEqual(MAX_GRADE)
    }
  })

  it('десяток нет ни у кого', () => {
    // По правилам ВШЭ десятка требует результата, превышающего программу.
    // Средний балл в десять за модуль — это не однокурсник, это опечатка.
    for (const gpa of COHORT_GPA) expect(gpa).toBeLessThan(MAX_GRADE)
  })

  it('есть и те, кто внизу', () => {
    expect(COHORT_GPA.some((gpa) => gpa < PASSING_GRADE)).toBe(true)
  })

  it('основная масса между пятёркой и восьмёркой', () => {
    const middle = COHORT_GPA.filter((gpa) => gpa >= 5 && gpa <= 8)
    expect(middle.length / COHORT_GPA.length).toBeGreaterThan(0.5)
  })

  it('отличная работа даёт верх списка, а ноль — низ', () => {
    expect(rankAmong(9.5, COHORT_GPA).place).toBe(1)
    expect(rankAmong(0, COHORT_GPA).place).toBe(COHORT_GPA.length + 1)
  })

  it('крепкая работа не делает первым автоматически', () => {
    // Иначе рейтинг перестаёт быть источником тревоги, ради которого он и есть.
    expect(rankAmong(7, COHORT_GPA).place).toBeGreaterThan(3)
  })
})
