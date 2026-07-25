import { describe, expect, it } from 'vitest'
import type { Course } from './Course'
import { Gradebook, HELD_ASSESSMENT_KINDS, roundGrade } from './Gradebook'

const COURSE: Course = {
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

describe('roundGrade', () => {
  it('округляет арифметически к ближайшему целому', () => {
    expect(roundGrade(7.4)).toBe(7)
    expect(roundGrade(7.5)).toBe(8)
    expect(roundGrade(7.6)).toBe(8)
  })

  it('зажимает в диапазон 0..10', () => {
    expect(roundGrade(-3)).toBe(0)
    expect(roundGrade(42)).toBe(10)
  })
})

describe('Gradebook', () => {
  it('новый журнал ничего не знает', () => {
    const book = new Gradebook()
    expect(book.gradeFor('greek', 'exam')).toBeNull()
    expect(book.isGraded('greek', 'exam')).toBe(false)
    expect(book.isComplete(COURSE)).toBe(false)
  })

  it('записывает и отдаёт оценку', () => {
    const book = new Gradebook()
    book.record('greek', 'exam', 8)
    expect(book.gradeFor('greek', 'exam')).toBe(8)
    expect(book.isGraded('greek', 'exam')).toBe(true)
  })

  it('зажимает и округляет записываемую оценку', () => {
    const book = new Gradebook()
    book.record('greek', 'exam', 7.5)
    expect(book.gradeFor('greek', 'exam')).toBe(8)
    book.record('greek', 'quizzes', 99)
    expect(book.gradeFor('greek', 'quizzes')).toBe(10)
  })

  it('накопленная считает только выставленные элементы, кроме экзамена', () => {
    const book = new Gradebook()
    book.record('greek', 'classwork', 8)
    book.record('greek', 'quizzes', 6)
    // 0.3*8 + 0.3*6 = 4.2, нормируем на выставленный вес 0.6 -> 7
    expect(book.accumulated(COURSE)).toBeCloseTo(7, 5)
  })

  it('накопленная равна нулю, если ничего не выставлено', () => {
    expect(new Gradebook().accumulated(COURSE)).toBe(0)
  })

  it('максимально достижимый итог падает по мере плохих оценок', () => {
    const book = new Gradebook()
    expect(book.maxAchievable(COURSE)).toBe(10)

    book.record('greek', 'classwork', 0)
    // 0.3*0 + 0.3*10 + 0.4*10 = 7
    expect(book.maxAchievable(COURSE)).toBe(7)

    book.record('greek', 'quizzes', 0)
    // остаётся только экзамен: 0.4*10 = 4
    expect(book.maxAchievable(COURSE)).toBe(4)
  })

  it('забитый модуль не спасает даже отличный экзамен', () => {
    const doomed = new Gradebook()
    doomed.record('greek', 'classwork', 0)
    doomed.record('greek', 'quizzes', 0)
    // Максимум, что осталось, — вес экзамена: 0.4 * 10 = 4
    expect(doomed.maxAchievable(COURSE)).toBe(4)

    doomed.record('greek', 'exam', 10)
    expect(doomed.finalGrade(COURSE)).toBe(4)

    const worse = new Gradebook()
    worse.record('greek', 'classwork', 0)
    worse.record('greek', 'quizzes', 0)
    worse.record('greek', 'exam', 3)
    expect(worse.isPassed(COURSE)).toBe(false)
  })

  it('итог считается только когда выставлено всё', () => {
    const book = new Gradebook()
    book.record('greek', 'classwork', 8)
    book.record('greek', 'quizzes', 8)
    expect(book.finalGrade(COURSE)).toBeNull()

    book.record('greek', 'exam', 9)
    expect(book.isComplete(COURSE)).toBe(true)
    // 0.3*8 + 0.3*8 + 0.4*9 = 8.4 -> 8
    expect(book.finalGrade(COURSE)).toBe(8)
    expect(book.isPassed(COURSE)).toBe(true)
  })

  it('проваленный блокирующий элемент топит курс независимо от арифметики', () => {
    const withBlocking: Course = {
      ...COURSE,
      assessments: [
        { id: 'classwork', label: 'Работа', weight: 0.6, kind: 'seminar', blocking: false },
        { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: true },
      ],
    }
    const book = new Gradebook()
    book.record('greek', 'classwork', 10)
    book.record('greek', 'exam', 2)
    // Арифметически 0.6*10 + 0.4*2 = 6.8 -> 7, но блокирующий провален
    expect(book.isPassed(withBlocking)).toBe(false)
  })

  it('переживает сохранение и загрузку', () => {
    const book = new Gradebook()
    book.record('greek', 'exam', 7)
    const restored = Gradebook.fromJSON(JSON.parse(JSON.stringify(book.toJSON())))
    expect(restored.gradeFor('greek', 'exam')).toBe(7)
  })
})

describe('оценка на конец модуля', () => {
  it('считает только по проведённым элементам, нормируя веса', () => {
    // Экзамена в игре пока нет: если бы он шёл в формулу нулём, восьмёрка
    // за работу на занятиях превратилась бы в тройку.
    const book = new Gradebook()
    book.record('greek', 'classwork', 8)
    expect(book.settledGrade(COURSE, ['seminar'])).toBe(8)
  })

  it('проведённое, но несделанное честно стоит ноль', () => {
    const book = new Gradebook()
    book.record('greek', 'classwork', 10)
    // Контрольные проводились, а этих нет в ведомости — значит, ноль.
    expect(book.settledGrade(COURSE, ['seminar', 'quiz'])).toBe(5)
  })

  it('молчавший весь модуль получает ноль, а не отсутствие оценки', () => {
    expect(new Gradebook().settledGrade(COURSE, ['seminar'])).toBe(0)
  })

  it('дисциплину, у которой нечего оценивать, не оценивает вовсе', () => {
    expect(new Gradebook().settledGrade(COURSE, ['essay'])).toBeNull()
  })

  it('игра пока проводит семинары — и объявляет об этом списком', () => {
    expect([...HELD_ASSESSMENT_KINDS]).toEqual(['seminar'])
  })
})
