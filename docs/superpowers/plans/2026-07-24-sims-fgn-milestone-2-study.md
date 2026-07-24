# Симс ФГН — Этап 2: Учебная система

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить ходячий скелет в симулятор студента: календарь модуля, расписание пар, посещение занятий, выступления на семинарах, эссе с дедлайнами, экзамены и настоящая арифметика оценок ВШЭ.

**Architecture:** Новый модуль `src/sim/study/` — чистый TypeScript, как и остальная симуляция. `World` получает поле `study: StudyState` и делегирует ему учебные команды, сам не разрастаясь. Курсы, расписание и формулы оценивания — данные в `src/content/`, а не логика.

**Tech Stack:** тот же — TypeScript strict, Vitest. Ни одной новой зависимости.

## Global Constraints

- Всё из этапа 1 остаётся в силе: `src/sim/` не импортирует `react`, `three`, `@react-three/*`, `zustand`, `src/content/`.
- Оценки — целые от 0 до 10. Порог сдачи — 4.
- Веса элементов контроля в сумме дают ровно 1. Это проверяется тестом на данных.
- Округление итоговой оценки — арифметическое к ближайшему целому.
- Учебная неделя шестидневная: понедельник–суббота. Воскресенье — выходной.
- Пара длится 80 минут.
- Весь пользовательский текст на русском, коммиты на русском.

---

### Task 1: Модель курса и элементов контроля

**Files:**
- Create: `src/sim/study/Course.ts`
- Test: `src/sim/study/Course.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `type AssessmentKind = 'seminar' | 'homework' | 'essay' | 'quiz' | 'exam'`
  - `interface Assessment { id, label, weight, kind, blocking }`
  - `interface Course { id, title, short, teacherId, assessments }`
  - `type CourseCatalog = Record<string, Course>`
  - `function validateCourse(course: Course): string[]`
  - `function findAssessment(course: Course, id: string): Assessment | undefined`
  - `const PASSING_GRADE = 4`
  - `const MAX_GRADE = 10`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/Course.test.ts`:

```ts
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
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Course`
Expected: FAIL — `Failed to resolve import "./Course"`.

- [ ] **Step 3: Реализовать модель**

Создать `src/sim/study/Course.ts`:

```ts
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
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Course`
Expected: PASS, 7 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study
git commit -m "feat: модель курса и элементов контроля с проверкой формулы"
```

---

### Task 2: Журнал оценок

**Files:**
- Create: `src/sim/study/Gradebook.ts`
- Test: `src/sim/study/Gradebook.test.ts`

**Interfaces:**
- Consumes: `Course`, `Assessment`, `PASSING_GRADE`, `MAX_GRADE`.
- Produces:
  - `class Gradebook` с методами `record`, `gradeFor`, `isGraded`, `accumulated`, `maxAchievable`, `finalGrade`, `isComplete`, `isPassed`, `toJSON`, `static fromJSON`
  - `function roundGrade(value: number): number`

Ключевая механика — `maxAchievable`: максимальный итог, который ещё достижим при уже выставленных оценках. Именно она даёт игроку почувствовать, что забитый модуль пересдачей не спасти.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/Gradebook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Course } from './Course'
import { Gradebook, roundGrade } from './Gradebook'

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
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Gradebook`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать журнал**

Создать `src/sim/study/Gradebook.ts`:

```ts
import { MAX_GRADE, PASSING_GRADE, type Course } from './Course'

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

  static fromJSON(records: GradeRecords): Gradebook {
    const book = new Gradebook()
    book.records = JSON.parse(JSON.stringify(records)) as GradeRecords
    return book
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Gradebook`
Expected: PASS, 12 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study
git commit -m "feat: журнал оценок с накопленной и максимально достижимым итогом"
```

---

### Task 3: Календарь модуля

**Files:**
- Create: `src/sim/study/Calendar.ts`
- Test: `src/sim/study/Calendar.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `const STUDY_WEEKS = 6`, `const SESSION_WEEK = 6`, `const TOTAL_DAYS = 49`
  - `type DayKind = 'study' | 'weekend' | 'session' | 'over'`
  - `function weekOf(day: number): number`
  - `function weekdayOf(day: number): number`
  - `function dayKind(day: number): DayKind`
  - `function isStudyDay(day: number): boolean`
  - `function describeDay(day: number): string`

День 0 — понедельник первой недели. Индекс дня недели: 0 понедельник … 5 суббота, 6 воскресенье.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/Calendar.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  dayKind,
  describeDay,
  isStudyDay,
  SESSION_WEEK,
  STUDY_WEEKS,
  TOTAL_DAYS,
  weekdayOf,
  weekOf,
} from './Calendar'

describe('календарь модуля', () => {
  it('модуль длится шесть учебных недель плюс сессионная', () => {
    expect(STUDY_WEEKS).toBe(6)
    expect(SESSION_WEEK).toBe(6)
    expect(TOTAL_DAYS).toBe(49)
  })

  it('считает номер недели', () => {
    expect(weekOf(0)).toBe(0)
    expect(weekOf(6)).toBe(0)
    expect(weekOf(7)).toBe(1)
    expect(weekOf(41)).toBe(5)
    expect(weekOf(42)).toBe(6)
  })

  it('считает день недели, где 0 — понедельник', () => {
    expect(weekdayOf(0)).toBe(0)
    expect(weekdayOf(5)).toBe(5)
    expect(weekdayOf(6)).toBe(6)
    expect(weekdayOf(7)).toBe(0)
  })

  it('суббота учебная, воскресенье выходное', () => {
    expect(dayKind(5)).toBe('study')
    expect(dayKind(6)).toBe('weekend')
    expect(isStudyDay(5)).toBe(true)
    expect(isStudyDay(6)).toBe(false)
  })

  it('седьмая неделя — сессия', () => {
    expect(dayKind(42)).toBe('session')
    expect(dayKind(47)).toBe('session')
    expect(isStudyDay(42)).toBe(false)
  })

  it('воскресенье сессионной недели всё равно выходное', () => {
    expect(dayKind(48)).toBe('weekend')
  })

  it('после сессии модуль окончен', () => {
    expect(dayKind(49)).toBe('over')
    expect(dayKind(100)).toBe('over')
  })

  it('описывает день по-русски', () => {
    expect(describeDay(0)).toBe('Неделя 1, понедельник')
    expect(describeDay(5)).toBe('Неделя 1, суббота')
    expect(describeDay(42)).toBe('Сессия, понедельник')
    expect(describeDay(49)).toBe('Модуль окончен')
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Calendar`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать календарь**

Создать `src/sim/study/Calendar.ts`:

```ts
/** Учебных недель в модуле. */
export const STUDY_WEEKS = 6

/** Номер сессионной недели (нумерация с нуля). */
export const SESSION_WEEK = 6

export const DAYS_PER_WEEK = 7

/** Всего дней в модуле вместе с сессией. */
export const TOTAL_DAYS = (STUDY_WEEKS + 1) * DAYS_PER_WEEK

export type DayKind = 'study' | 'weekend' | 'session' | 'over'

const WEEKDAY_NAMES = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const

/** Номер недели с нуля. */
export function weekOf(day: number): number {
  return Math.floor(day / DAYS_PER_WEEK)
}

/** День недели: 0 — понедельник, 5 — суббота, 6 — воскресенье. */
export function weekdayOf(day: number): number {
  return day % DAYS_PER_WEEK
}

/**
 * Учебная неделя в ВШЭ шестидневная: занятия идут с понедельника
 * по субботу, выходной один.
 */
export function dayKind(day: number): DayKind {
  if (day >= TOTAL_DAYS) return 'over'
  if (weekdayOf(day) === 6) return 'weekend'
  return weekOf(day) >= SESSION_WEEK ? 'session' : 'study'
}

export function isStudyDay(day: number): boolean {
  return dayKind(day) === 'study'
}

export function describeDay(day: number): string {
  const kind = dayKind(day)
  if (kind === 'over') return 'Модуль окончен'

  const weekday = WEEKDAY_NAMES[weekdayOf(day)] ?? 'понедельник'
  if (kind === 'session' || (kind === 'weekend' && weekOf(day) >= SESSION_WEEK)) {
    return `Сессия, ${weekday}`
  }
  return `Неделя ${weekOf(day) + 1}, ${weekday}`
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Calendar`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study/Calendar.ts src/sim/study/Calendar.test.ts
git commit -m "feat: календарь модуля с шестидневной неделей и сессией"
```

---

### Task 4: Расписание занятий

**Files:**
- Create: `src/sim/study/Schedule.ts`
- Test: `src/sim/study/Schedule.test.ts`

**Interfaces:**
- Consumes: `weekdayOf`, `isStudyDay`.
- Produces:
  - `interface Period { index, startMinutes, endMinutes, label }`
  - `const PERIODS: readonly Period[]`
  - `interface Lesson { id, courseId, kind: 'lecture' | 'seminar', weekday, period, room }`
  - `type Schedule = readonly Lesson[]`
  - `function lessonsOnDay(schedule, day): Lesson[]`
  - `function lessonAt(schedule, day, minutes): Lesson | null`
  - `function nextLessonOnDay(schedule, day, minutes): Lesson | null`
  - `function periodOf(index: number): Period | undefined`
  - `function validateSchedule(schedule: Schedule): string[]`

Сетка звонков достоверна по духу: пара 80 минут, перемены, длинный обеденный перерыв после второй пары.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/Schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  lessonAt,
  lessonsOnDay,
  nextLessonOnDay,
  PERIODS,
  periodOf,
  validateSchedule,
  type Lesson,
  type Schedule,
} from './Schedule'

const SCHEDULE: Schedule = [
  { id: 'l1', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'l2', courseId: 'logic', kind: 'lecture', weekday: 0, period: 2, room: 'А-308' },
  { id: 'l3', courseId: 'greek', kind: 'seminar', weekday: 3, period: 1, room: 'А-204' },
]

describe('сетка звонков', () => {
  it('пары идут по 80 минут', () => {
    for (const period of PERIODS) {
      expect(period.endMinutes - period.startMinutes).toBe(80)
    }
  })

  it('пары не накладываются и идут по возрастанию', () => {
    for (let i = 1; i < PERIODS.length; i++) {
      expect(PERIODS[i]!.startMinutes).toBeGreaterThanOrEqual(PERIODS[i - 1]!.endMinutes)
    }
  })

  it('подписаны как ЧЧ:ММ–ЧЧ:ММ', () => {
    expect(PERIODS[0]!.label).toMatch(/^\d{2}:\d{2}–\d{2}:\d{2}$/)
  })

  it('отдаёт пару по индексу', () => {
    expect(periodOf(0)).toBe(PERIODS[0])
    expect(periodOf(99)).toBeUndefined()
  })
})

describe('расписание', () => {
  it('принимает корректное расписание', () => {
    expect(validateSchedule(SCHEDULE)).toEqual([])
  })

  it('ругается на два занятия в одно время', () => {
    const clash: Schedule = [
      ...SCHEDULE,
      { id: 'l4', courseId: 'history', kind: 'lecture', weekday: 0, period: 0, room: 'А-312' },
    ]
    expect(validateSchedule(clash).join(' ')).toContain('одновременно')
  })

  it('ругается на занятие в воскресенье', () => {
    const sunday: Schedule = [
      { id: 'l5', courseId: 'greek', kind: 'seminar', weekday: 6, period: 0, room: 'А-204' },
    ]
    expect(validateSchedule(sunday).join(' ')).toContain('воскресень')
  })

  it('отдаёт занятия дня', () => {
    // День 0 — понедельник
    expect(lessonsOnDay(SCHEDULE, 0).map((l) => l.id)).toEqual(['l1', 'l2'])
    // День 3 — четверг
    expect(lessonsOnDay(SCHEDULE, 3).map((l) => l.id)).toEqual(['l3'])
    // День 1 — вторник, пусто
    expect(lessonsOnDay(SCHEDULE, 1)).toEqual([])
  })

  it('в воскресенье занятий нет', () => {
    expect(lessonsOnDay(SCHEDULE, 6)).toEqual([])
  })

  it('находит идущее сейчас занятие', () => {
    const first = PERIODS[0]!
    expect(lessonAt(SCHEDULE, 0, first.startMinutes + 10)?.id).toBe('l1')
    expect(lessonAt(SCHEDULE, 0, first.endMinutes + 5)).toBeNull()
  })

  it('находит следующее занятие дня', () => {
    expect(nextLessonOnDay(SCHEDULE, 0, 0)?.id).toBe('l1')
    expect(nextLessonOnDay(SCHEDULE, 0, PERIODS[0]!.endMinutes)?.id).toBe('l2')
    expect(nextLessonOnDay(SCHEDULE, 0, 23 * 60)).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Schedule`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать расписание**

Создать `src/sim/study/Schedule.ts`:

```ts
import { isStudyDay, weekdayOf } from './Calendar'

/** Длительность пары: два академических часа. */
export const LESSON_MINUTES = 80

export interface Period {
  index: number
  startMinutes: number
  endMinutes: number
  /** Подпись вида «09:00–10:20». */
  label: string
}

function formatClock(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function makePeriod(index: number, startMinutes: number): Period {
  const endMinutes = startMinutes + LESSON_MINUTES
  return {
    index,
    startMinutes,
    endMinutes,
    label: `${formatClock(startMinutes)}–${formatClock(endMinutes)}`,
  }
}

/**
 * Сетка звонков. Точное московское расписание ВШЭ в открытых источниках
 * не публикуется — оно живёт в закрытой системе расписаний. Эта сетка
 * достоверна по духу: пара 80 минут, короткие перемены, длинный
 * обеденный перерыв после второй пары.
 */
export const PERIODS: readonly Period[] = [
  makePeriod(0, 9 * 60),
  makePeriod(1, 10 * 60 + 30),
  makePeriod(2, 12 * 60 + 20),
  makePeriod(3, 13 * 60 + 50),
  makePeriod(4, 15 * 60 + 20),
  makePeriod(5, 16 * 60 + 50),
  makePeriod(6, 18 * 60 + 20),
]

export interface Lesson {
  id: string
  courseId: string
  kind: 'lecture' | 'seminar'
  /** 0 — понедельник, 5 — суббота. */
  weekday: number
  /** Индекс пары в PERIODS. */
  period: number
  /** Номер аудитории, например «А-204». */
  room: string
}

export type Schedule = readonly Lesson[]

export function periodOf(index: number): Period | undefined {
  return PERIODS[index]
}

/** Возвращает список ошибок расписания. Пустой список означает, что оно корректно. */
export function validateSchedule(schedule: Schedule): string[] {
  const errors: string[] = []
  const occupied = new Map<string, string>()

  for (const lesson of schedule) {
    if (lesson.weekday === 6) {
      errors.push(`Занятие ${lesson.id} поставлено в воскресенье`)
    }
    if (!periodOf(lesson.period)) {
      errors.push(`Занятие ${lesson.id} ссылается на несуществующую пару ${lesson.period}`)
    }

    const slot = `${lesson.weekday}:${lesson.period}`
    const taken = occupied.get(slot)
    if (taken) {
      errors.push(`Занятия ${taken} и ${lesson.id} стоят одновременно`)
    } else {
      occupied.set(slot, lesson.id)
    }
  }

  return errors
}

export function lessonsOnDay(schedule: Schedule, day: number): Lesson[] {
  if (!isStudyDay(day)) return []
  const weekday = weekdayOf(day)
  return schedule
    .filter((lesson) => lesson.weekday === weekday)
    .sort((a, b) => a.period - b.period)
}

/** Занятие, идущее прямо сейчас, или null. */
export function lessonAt(schedule: Schedule, day: number, minutes: number): Lesson | null {
  for (const lesson of lessonsOnDay(schedule, day)) {
    const period = periodOf(lesson.period)
    if (!period) continue
    if (minutes >= period.startMinutes && minutes < period.endMinutes) return lesson
  }
  return null
}

/** Ближайшее занятие сегодня, которое ещё не началось. */
export function nextLessonOnDay(
  schedule: Schedule,
  day: number,
  minutes: number,
): Lesson | null {
  for (const lesson of lessonsOnDay(schedule, day)) {
    const period = periodOf(lesson.period)
    if (!period) continue
    if (period.startMinutes > minutes) return lesson
  }
  return null
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Schedule`
Expected: PASS, 10 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study/Schedule.ts src/sim/study/Schedule.test.ts
git commit -m "feat: сетка звонков и расписание занятий"
```

---

### Task 5: Посещение занятий

**Files:**
- Create: `src/sim/study/Attendance.ts`
- Test: `src/sim/study/Attendance.test.ts`

**Interfaces:**
- Consumes: `Lesson`, `Period`, `periodOf`.
- Produces:
  - `type AttendanceMark = 'present' | 'late' | 'absent'`
  - `const LATE_THRESHOLD_MINUTES = 10`
  - `class AttendanceLog` с методами `mark`, `markFor`, `countByCourse`, `attendanceGrade`, `toJSON`, `static fromJSON`
  - `function classifyArrival(period: Period, arrivalMinutes: number): AttendanceMark`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/Attendance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AttendanceLog, classifyArrival, LATE_THRESHOLD_MINUTES } from './Attendance'
import { PERIODS } from './Schedule'

const PERIOD = PERIODS[0]!

describe('classifyArrival', () => {
  it('пришёл вовремя', () => {
    expect(classifyArrival(PERIOD, PERIOD.startMinutes)).toBe('present')
    expect(classifyArrival(PERIOD, PERIOD.startMinutes - 5)).toBe('present')
  })

  it('опоздал в пределах порога', () => {
    expect(classifyArrival(PERIOD, PERIOD.startMinutes + LATE_THRESHOLD_MINUTES - 1)).toBe('present')
    expect(classifyArrival(PERIOD, PERIOD.startMinutes + LATE_THRESHOLD_MINUTES + 1)).toBe('late')
  })

  it('пришёл под конец — это прогул', () => {
    expect(classifyArrival(PERIOD, PERIOD.endMinutes - 1)).toBe('late')
    expect(classifyArrival(PERIOD, PERIOD.endMinutes + 1)).toBe('absent')
  })
})

describe('AttendanceLog', () => {
  it('пустой журнал не знает отметок', () => {
    expect(new AttendanceLog().markFor('l1')).toBeNull()
  })

  it('запоминает отметку', () => {
    const log = new AttendanceLog()
    log.mark('l1', 'greek', 'present')
    expect(log.markFor('l1')).toBe('present')
  })

  it('считает отметки по курсу', () => {
    const log = new AttendanceLog()
    log.mark('l1', 'greek', 'present')
    log.mark('l2', 'greek', 'late')
    log.mark('l3', 'greek', 'absent')
    log.mark('l4', 'logic', 'present')

    expect(log.countByCourse('greek')).toEqual({ present: 1, late: 1, absent: 1 })
    expect(log.countByCourse('logic')).toEqual({ present: 1, late: 0, absent: 0 })
    expect(log.countByCourse('нет')).toEqual({ present: 0, late: 0, absent: 0 })
  })

  it('переводит посещаемость в оценку', () => {
    const perfect = new AttendanceLog()
    for (let i = 0; i < 10; i++) perfect.mark(`l${i}`, 'greek', 'present')
    expect(perfect.attendanceGrade('greek')).toBe(10)

    const awful = new AttendanceLog()
    for (let i = 0; i < 10; i++) awful.mark(`l${i}`, 'greek', 'absent')
    expect(awful.attendanceGrade('greek')).toBe(0)
  })

  it('опоздание засчитывается вполовину', () => {
    const log = new AttendanceLog()
    for (let i = 0; i < 10; i++) log.mark(`l${i}`, 'greek', 'late')
    expect(log.attendanceGrade('greek')).toBe(5)
  })

  it('без занятий посещаемость считается идеальной', () => {
    expect(new AttendanceLog().attendanceGrade('greek')).toBe(10)
  })

  it('переживает сохранение и загрузку', () => {
    const log = new AttendanceLog()
    log.mark('l1', 'greek', 'late')
    const restored = AttendanceLog.fromJSON(JSON.parse(JSON.stringify(log.toJSON())))
    expect(restored.markFor('l1')).toBe('late')
    expect(restored.countByCourse('greek').late).toBe(1)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Attendance`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать учёт посещаемости**

Создать `src/sim/study/Attendance.ts`:

```ts
import { MAX_GRADE } from './Course'
import type { Period } from './Schedule'

/** Сколько минут опоздания ещё считается приходом вовремя. */
export const LATE_THRESHOLD_MINUTES = 10

export type AttendanceMark = 'present' | 'late' | 'absent'

export interface AttendanceCounts {
  present: number
  late: number
  absent: number
}

interface AttendanceEntry {
  courseId: string
  mark: AttendanceMark
}

/** Насколько опоздание засчитывается в посещаемость. */
const LATE_CREDIT = 0.5

export function classifyArrival(period: Period, arrivalMinutes: number): AttendanceMark {
  if (arrivalMinutes >= period.endMinutes) return 'absent'
  if (arrivalMinutes <= period.startMinutes + LATE_THRESHOLD_MINUTES) return 'present'
  return 'late'
}

export class AttendanceLog {
  private entries: Record<string, AttendanceEntry> = {}

  mark(lessonId: string, courseId: string, mark: AttendanceMark): void {
    this.entries[lessonId] = { courseId, mark }
  }

  markFor(lessonId: string): AttendanceMark | null {
    return this.entries[lessonId]?.mark ?? null
  }

  countByCourse(courseId: string): AttendanceCounts {
    const counts: AttendanceCounts = { present: 0, late: 0, absent: 0 }
    for (const entry of Object.values(this.entries)) {
      if (entry.courseId !== courseId) continue
      counts[entry.mark]++
    }
    return counts
  }

  /**
   * Посещаемость как оценка 0..10. Опоздание засчитывается вполовину.
   * Пока занятий не было, посещаемость считается идеальной — иначе
   * первого сентября студент начинал бы с нуля.
   */
  attendanceGrade(courseId: string): number {
    const { present, late, absent } = this.countByCourse(courseId)
    const total = present + late + absent
    if (total === 0) return MAX_GRADE
    return (present + late * LATE_CREDIT) / total * MAX_GRADE
  }

  toJSON(): Record<string, AttendanceEntry> {
    return JSON.parse(JSON.stringify(this.entries)) as Record<string, AttendanceEntry>
  }

  static fromJSON(entries: Record<string, AttendanceEntry>): AttendanceLog {
    const log = new AttendanceLog()
    log.entries = JSON.parse(JSON.stringify(entries)) as Record<string, AttendanceEntry>
    return log
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Attendance`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study/Attendance.ts src/sim/study/Attendance.test.ts
git commit -m "feat: учёт посещаемости с опозданиями"
```

---

### Task 6: Эссе с прогрессом и дедлайном

**Files:**
- Create: `src/sim/study/Essay.ts`
- Test: `src/sim/study/Essay.test.ts`

**Interfaces:**
- Consumes: `MAX_GRADE`.
- Produces:
  - `interface EssayTask { id, courseId, assessmentId, title, dueDay, requiredEffort }`
  - `interface EssayProgress { effort, quality, submitted, submittedDay, cheated }`
  - `class EssayJournal` с методами `start`, `work`, `progressFor`, `submit`, `isOverdue`, `estimateGrade`, `toJSON`, `static fromJSON`
  - `function essayGrade(progress, task, submittedDay): number`

Качество эссе зависит от вложенных усилий, навыка письма и стресса. Списывание даёт быстрый результат и риск нуля.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/Essay.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { EssayJournal, essayGrade, type EssayTask } from './Essay'

const TASK: EssayTask = {
  id: 'essay-nis',
  courseId: 'nis',
  assessmentId: 'essay',
  title: 'Финальное эссе',
  dueDay: 30,
  requiredEffort: 300,
}

describe('EssayJournal', () => {
  it('незапущенное эссе не имеет прогресса', () => {
    expect(new EssayJournal().progressFor(TASK.id)).toBeNull()
  })

  it('запускает работу над эссе', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    const progress = journal.progressFor(TASK.id)
    expect(progress?.effort).toBe(0)
    expect(progress?.submitted).toBe(false)
  })

  it('накапливает усилия', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, 60, { writingSkill: 5, stress: 20 })
    journal.work(TASK.id, 60, { writingSkill: 5, stress: 20 })
    expect(journal.progressFor(TASK.id)!.effort).toBe(120)
  })

  it('высокий стресс снижает качество вложенного времени', () => {
    const calm = new EssayJournal()
    calm.start(TASK)
    calm.work(TASK.id, 120, { writingSkill: 5, stress: 0 })

    const panicking = new EssayJournal()
    panicking.start(TASK)
    panicking.work(TASK.id, 120, { writingSkill: 5, stress: 95 })

    expect(calm.progressFor(TASK.id)!.quality).toBeGreaterThan(
      panicking.progressFor(TASK.id)!.quality,
    )
  })

  it('навык письма повышает качество', () => {
    const novice = new EssayJournal()
    novice.start(TASK)
    novice.work(TASK.id, 120, { writingSkill: 0, stress: 20 })

    const master = new EssayJournal()
    master.start(TASK)
    master.work(TASK.id, 120, { writingSkill: 10, stress: 20 })

    expect(master.progressFor(TASK.id)!.quality).toBeGreaterThan(
      novice.progressFor(TASK.id)!.quality,
    )
  })

  it('работа над сданным эссе игнорируется', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, 300, { writingSkill: 5, stress: 10 })
    journal.submit(TASK.id, 20)
    journal.work(TASK.id, 300, { writingSkill: 5, stress: 10 })
    expect(journal.progressFor(TASK.id)!.effort).toBe(300)
  })

  it('видит просрочку', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    expect(journal.isOverdue(TASK, 29)).toBe(false)
    expect(journal.isOverdue(TASK, 31)).toBe(true)
    journal.submit(TASK.id, 25)
    expect(journal.isOverdue(TASK, 31)).toBe(false)
  })

  it('списывание отмечается отдельно и мгновенно доводит эссе до готовности', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.cheat(TASK)
    const progress = journal.progressFor(TASK.id)!
    expect(progress.cheated).toBe(true)
    expect(progress.quality).toBe(TASK.requiredEffort)
    // Списавший не потратил на текст ни минуты — в этом и смысл.
    expect(progress.effort).toBe(0)
  })
})

describe('essayGrade', () => {
  it('несданное эссе — ноль', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    expect(essayGrade(journal.progressFor(TASK.id)!, TASK, 31)).toBe(0)
  })

  it('полностью проработанное эссе даёт высокую оценку', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, TASK.requiredEffort, { writingSkill: 8, stress: 10 })
    journal.submit(TASK.id, 28)
    expect(essayGrade(journal.progressFor(TASK.id)!, TASK, 28)).toBeGreaterThanOrEqual(8)
  })

  it('недоработанное эссе оценивается ниже', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, TASK.requiredEffort / 4, { writingSkill: 8, stress: 10 })
    journal.submit(TASK.id, 28)
    expect(essayGrade(journal.progressFor(TASK.id)!, TASK, 28)).toBeLessThan(6)
  })

  it('сдача после дедлайна штрафуется', () => {
    const late = new EssayJournal()
    late.start(TASK)
    late.work(TASK.id, TASK.requiredEffort, { writingSkill: 8, stress: 10 })
    late.submit(TASK.id, 33)

    const onTime = new EssayJournal()
    onTime.start(TASK)
    onTime.work(TASK.id, TASK.requiredEffort, { writingSkill: 8, stress: 10 })
    onTime.submit(TASK.id, 28)

    expect(essayGrade(late.progressFor(TASK.id)!, TASK, 33)).toBeLessThan(
      essayGrade(onTime.progressFor(TASK.id)!, TASK, 28),
    )
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Essay`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать эссе**

Создать `src/sim/study/Essay.ts`:

```ts
import { MAX_GRADE } from './Course'

export interface EssayTask {
  id: string
  courseId: string
  /** Идентификатор элемента контроля, за который идёт оценка. */
  assessmentId: string
  title: string
  /** Игровой день, до конца которого нужно сдать. */
  dueDay: number
  /** Сколько игровых минут работы нужно для полноценного эссе. */
  requiredEffort: number
}

export interface EssayProgress {
  /** Вложенные игровые минуты. */
  effort: number
  /** Накопленное качество, 0..1 от идеала. */
  quality: number
  submitted: boolean
  submittedDay: number | null
  cheated: boolean
}

/** Условия, в которых студент работает над текстом. */
export interface WorkContext {
  /** Навык академического письма, 0..10. */
  writingSkill: number
  /** Текущий стресс, 0..100. */
  stress: number
}

/** Во сколько раз штрафуется оценка за просрочку. */
const OVERDUE_PENALTY = 0.5

export class EssayJournal {
  private progress: Record<string, EssayProgress> = {}

  start(task: EssayTask): void {
    if (this.progress[task.id]) return
    this.progress[task.id] = {
      effort: 0,
      quality: 0,
      submitted: false,
      submittedDay: null,
      cheated: false,
    }
  }

  progressFor(taskId: string): EssayProgress | null {
    return this.progress[taskId] ?? null
  }

  /**
   * Засчитывает потраченное на эссе время.
   * Качество вложенных минут зависит от навыка письма и стресса:
   * писать в панике можно, но выйдет заметно хуже.
   */
  work(taskId: string, minutes: number, context: WorkContext): void {
    const current = this.progress[taskId]
    if (!current || current.submitted) return

    const skillFactor = 0.6 + (context.writingSkill / MAX_GRADE) * 0.6
    const stressFactor = 1 - (context.stress / 100) * 0.5
    const gained = minutes * skillFactor * stressFactor

    current.effort += minutes
    current.quality += gained
  }

  /**
   * Списать: эссе мгновенно доводится до формальной готовности, но помечается.
   * Потраченное время не растёт — в этом весь смысл соблазна.
   * Метка cheated позже даёт шанс получить ноль за нарушение академических норм.
   */
  cheat(task: EssayTask): void {
    const current = this.progress[task.id]
    if (!current || current.submitted) return
    current.cheated = true
    current.quality = Math.max(current.quality, task.requiredEffort)
  }

  submit(taskId: string, day: number): void {
    const current = this.progress[taskId]
    if (!current || current.submitted) return
    current.submitted = true
    current.submittedDay = day
  }

  isOverdue(task: EssayTask, currentDay: number): boolean {
    const current = this.progress[task.id]
    if (current?.submitted) return false
    return currentDay > task.dueDay
  }

  toJSON(): Record<string, EssayProgress> {
    return JSON.parse(JSON.stringify(this.progress)) as Record<string, EssayProgress>
  }

  static fromJSON(progress: Record<string, EssayProgress>): EssayJournal {
    const journal = new EssayJournal()
    journal.progress = JSON.parse(JSON.stringify(progress)) as Record<string, EssayProgress>
    return journal
  }
}

/**
 * Оценка за эссе, 0..10.
 * Несданное — ноль. Сданное после дедлайна — половина.
 */
export function essayGrade(
  progress: EssayProgress,
  task: EssayTask,
  submittedDay: number,
): number {
  if (!progress.submitted) return 0

  const completeness = Math.min(1, progress.quality / task.requiredEffort)
  let grade = completeness * MAX_GRADE

  if (submittedDay > task.dueDay) grade *= OVERDUE_PENALTY

  return Math.min(MAX_GRADE, Math.max(0, grade))
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Essay`
Expected: PASS, 12 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study/Essay.ts src/sim/study/Essay.test.ts
git commit -m "feat: эссе с накоплением качества, дедлайном и соблазном списать"
```

---

### Task 7: Сборка учебного состояния

**Files:**
- Create: `src/sim/study/StudyState.ts`
- Test: `src/sim/study/StudyState.test.ts`

**Interfaces:**
- Consumes: всё из задач 1–6.
- Produces:
  - `interface StudyConfig { courses: CourseCatalog; schedule: Schedule; essays: EssayTask[] }`
  - `interface CourseStatus { course, accumulated, maxAchievable, finalGrade, isPassed, attendance }`
  - `class StudyState` с полями `gradebook`, `attendance`, `essays` и методами `attendLesson`, `recordSeminar`, `statusFor`, `allStatuses`, `gpa`, `debts`, `pendingEssays`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/study/StudyState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Course, CourseCatalog } from './Course'
import type { EssayTask } from './Essay'
import type { Schedule } from './Schedule'
import { StudyState, type StudyConfig } from './StudyState'

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

const LOGIC: Course = {
  id: 'logic',
  title: 'Логика',
  short: 'Логика',
  teacherId: 'dolgorukov',
  assessments: [
    { id: 'seminars', label: 'Работа на семинарах', weight: 0.6, kind: 'seminar', blocking: false },
    { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
  ],
}

const COURSES: CourseCatalog = { greek: GREEK, logic: LOGIC }

const SCHEDULE: Schedule = [
  { id: 'g-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'l-mon', courseId: 'logic', kind: 'lecture', weekday: 0, period: 1, room: 'А-308' },
]

const ESSAYS: EssayTask[] = [
  {
    id: 'greek-essay',
    courseId: 'greek',
    assessmentId: 'quizzes',
    title: 'Разбор отрывка',
    dueDay: 20,
    requiredEffort: 200,
  },
]

const CONFIG: StudyConfig = { courses: COURSES, schedule: SCHEDULE, essays: ESSAYS }

describe('StudyState', () => {
  it('отдаёт статус курса', () => {
    const study = new StudyState(CONFIG)
    const status = study.statusFor('greek')
    expect(status?.course.title).toBe('Древнегреческий язык')
    expect(status?.maxAchievable).toBe(10)
    expect(status?.finalGrade).toBeNull()
  })

  it('не знает несуществующий курс', () => {
    expect(new StudyState(CONFIG).statusFor('нет')).toBeNull()
  })

  it('отмечает посещение и учитывает его в оценке за работу', () => {
    const study = new StudyState(CONFIG)
    study.attendLesson('g-mon', 'greek', 'present')
    study.attendLesson('g-mon-2', 'greek', 'absent')
    expect(study.attendance.countByCourse('greek')).toEqual({ present: 1, late: 0, absent: 1 })
  })

  it('записывает результат выступления на семинаре', () => {
    const study = new StudyState(CONFIG)
    study.recordSeminar('logic', 8)
    expect(study.gradebook.gradeFor('logic', 'seminars')).toBe(8)
  })

  it('усредняет несколько выступлений', () => {
    const study = new StudyState(CONFIG)
    study.recordSeminar('logic', 10)
    study.recordSeminar('logic', 6)
    expect(study.gradebook.gradeFor('logic', 'seminars')).toBe(8)
  })

  it('считает средний балл только по завершённым курсам', () => {
    const study = new StudyState(CONFIG)
    expect(study.gpa()).toBeNull()

    study.gradebook.record('greek', 'classwork', 8)
    study.gradebook.record('greek', 'quizzes', 8)
    study.gradebook.record('greek', 'exam', 8)
    expect(study.gpa()).toBe(8)
  })

  it('считает задолженности', () => {
    const study = new StudyState(CONFIG)
    expect(study.debts()).toEqual([])

    study.gradebook.record('greek', 'classwork', 2)
    study.gradebook.record('greek', 'quizzes', 2)
    study.gradebook.record('greek', 'exam', 2)
    expect(study.debts()).toEqual(['greek'])
  })

  it('отдаёт несданные эссе с приближающимся сроком', () => {
    const study = new StudyState(CONFIG)
    expect(study.pendingEssays(15).map((e) => e.id)).toEqual(['greek-essay'])

    study.essays.start(ESSAYS[0]!)
    study.essays.submit('greek-essay', 18)
    expect(study.pendingEssays(19)).toEqual([])
  })

  it('отдаёт статусы всех курсов', () => {
    expect(new StudyState(CONFIG).allStatuses().map((s) => s.course.id).sort()).toEqual([
      'greek',
      'logic',
    ])
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- StudyState`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать сборку**

Создать `src/sim/study/StudyState.ts`:

```ts
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
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- StudyState`
Expected: PASS, 9 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/study/StudyState.ts src/sim/study/StudyState.test.ts
git commit -m "feat: сборка учебного состояния студента"
```

---

### Task 8: Настоящие курсы первого курса

**Files:**
- Create: `src/content/study/courses.ts`
- Create: `src/content/study/schedule.ts`
- Test: `src/content/study/courses.test.ts`

**Interfaces:**
- Consumes: `Course`, `CourseCatalog`, `validateCourse`, `Schedule`, `validateSchedule`, `EssayTask`.
- Produces: `const COURSES: CourseCatalog`, `const SCHEDULE: Schedule`, `const ESSAYS: EssayTask[]`, `const STUDY_CONFIG: StudyConfig`

Формулы взяты из настоящих программ дисциплин ОП «Философия» 2018–2021 (`research/student-life.md`, раздел 4.2). Не выдумывать свои.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/content/study/courses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateCourse } from '../../sim/study/Course'
import { validateSchedule } from '../../sim/study/Schedule'
import { COURSES, ESSAYS, SCHEDULE, STUDY_CONFIG } from './courses'

describe('курсы первого курса', () => {
  it('все формулы корректны', () => {
    for (const course of Object.values(COURSES)) {
      expect(validateCourse(course), course.title).toEqual([])
    }
  })

  it('идентификатор курса совпадает с ключом каталога', () => {
    for (const [key, course] of Object.entries(COURSES)) {
      expect(course.id).toBe(key)
    }
  })

  it('у каждого курса есть преподаватель', () => {
    for (const course of Object.values(COURSES)) {
      expect(course.teacherId.length, course.title).toBeGreaterThan(0)
    }
  })

  it('расписание корректно', () => {
    expect(validateSchedule(SCHEDULE)).toEqual([])
  })

  it('каждое занятие ссылается на существующий курс', () => {
    for (const lesson of SCHEDULE) {
      expect(COURSES[lesson.courseId], lesson.id).toBeDefined()
    }
  })

  it('у каждого курса есть хотя бы одно занятие в расписании', () => {
    for (const id of Object.keys(COURSES)) {
      expect(SCHEDULE.some((lesson) => lesson.courseId === id), id).toBe(true)
    }
  })

  it('номера аудиторий выглядят как настоящие', () => {
    for (const lesson of SCHEDULE) {
      expect(lesson.room, lesson.id).toMatch(/^[А-Я]-\d{3}$/)
    }
  })

  it('каждое эссе ссылается на существующий элемент контроля', () => {
    for (const task of ESSAYS) {
      const course = COURSES[task.courseId]
      expect(course, task.id).toBeDefined()
      expect(course!.assessments.some((a) => a.id === task.assessmentId), task.id).toBe(true)
    }
  })

  it('дедлайны эссе попадают внутрь модуля', () => {
    for (const task of ESSAYS) {
      expect(task.dueDay, task.id).toBeGreaterThan(0)
      expect(task.dueDay, task.id).toBeLessThan(42)
    }
  })

  it('конфигурация собрана целиком', () => {
    expect(STUDY_CONFIG.courses).toBe(COURSES)
    expect(STUDY_CONFIG.schedule).toBe(SCHEDULE)
    expect(STUDY_CONFIG.essays).toBe(ESSAYS)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- courses`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать курсы**

Создать `src/content/study/courses.ts`:

```ts
import type { CourseCatalog } from '../../sim/study/Course'
import type { EssayTask } from '../../sim/study/Essay'
import type { Schedule } from '../../sim/study/Schedule'
import type { StudyConfig } from '../../sim/study/StudyState'

/**
 * Дисциплины первого курса ОП «Философия» ФГН НИУ ВШЭ.
 * Формулы результирующей оценки взяты из настоящих программ дисциплин
 * 2018–2021 годов, см. research/student-life.md, раздел 4.2.
 */
export const COURSES: CourseCatalog = {
  greek: {
    id: 'greek',
    title: 'Древнегреческий язык',
    short: 'Греческий',
    teacherId: 'alieva',
    // Настоящая формула: 0.3 текущий контроль + 0.3 экспресс-контрольные + 0.4 экзамен
    assessments: [
      { id: 'classwork', label: 'Работа на занятиях', weight: 0.3, kind: 'seminar', blocking: false },
      { id: 'quizzes', label: 'Экспресс-контрольные', weight: 0.3, kind: 'quiz', blocking: false },
      { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
    ],
  },

  nis: {
    id: 'nis',
    title: 'НИС «Жанры и методы философского исследования»',
    short: 'НИС',
    teacherId: 'marey',
    // Настоящая формула: 0.33 домашние + 0.34 работа на семинарах + 0.33 финальное эссе
    assessments: [
      { id: 'homework', label: 'Домашние задания', weight: 0.33, kind: 'homework', blocking: false },
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.34, kind: 'seminar', blocking: false },
      { id: 'essay', label: 'Финальное эссе', weight: 0.33, kind: 'essay', blocking: false },
    ],
  },

  logic: {
    id: 'logic',
    title: 'Логика',
    short: 'Логика',
    teacherId: 'dolgorukov',
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.3, kind: 'seminar', blocking: false },
      { id: 'problems', label: 'Задачи', weight: 0.3, kind: 'homework', blocking: false },
      { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
    ],
  },

  histphil: {
    id: 'histphil',
    title: 'История философии',
    short: 'История философии',
    teacherId: 'mikhailovsky',
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.3, kind: 'seminar', blocking: false },
      { id: 'essay', label: 'Эссе', weight: 0.3, kind: 'essay', blocking: false },
      { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
    ],
  },

  ontology: {
    id: 'ontology',
    title: 'НИС «Основные темы и методы философского познания»',
    short: 'Онтология',
    teacherId: 'krechetova',
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.4, kind: 'seminar', blocking: false },
      { id: 'essay', label: 'Итоговое эссе', weight: 0.6, kind: 'essay', blocking: false },
    ],
  },
}

/**
 * Расписание модуля. Аудитории — настоящие номера корпуса А,
 * зафиксированные в расписаниях и программах конференций ФГН.
 * Учебная неделя шестидневная: 0 — понедельник, 5 — суббота.
 */
export const SCHEDULE: Schedule = [
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'histphil-mon', courseId: 'histphil', kind: 'lecture', weekday: 0, period: 1, room: 'А-308' },
  { id: 'logic-tue', courseId: 'logic', kind: 'lecture', weekday: 1, period: 1, room: 'А-312' },
  { id: 'nis-tue', courseId: 'nis', kind: 'seminar', weekday: 1, period: 2, room: 'А-204' },
  { id: 'greek-wed', courseId: 'greek', kind: 'seminar', weekday: 2, period: 0, room: 'А-204' },
  { id: 'ontology-wed', courseId: 'ontology', kind: 'seminar', weekday: 2, period: 2, room: 'А-323' },
  { id: 'histphil-thu', courseId: 'histphil', kind: 'seminar', weekday: 3, period: 1, room: 'А-308' },
  { id: 'logic-thu', courseId: 'logic', kind: 'seminar', weekday: 3, period: 2, room: 'А-312' },
  { id: 'nis-fri', courseId: 'nis', kind: 'seminar', weekday: 4, period: 1, room: 'А-204' },
  { id: 'greek-sat', courseId: 'greek', kind: 'seminar', weekday: 5, period: 0, room: 'А-204' },
]

export const ESSAYS: EssayTask[] = [
  {
    id: 'nis-essay',
    courseId: 'nis',
    assessmentId: 'essay',
    title: 'Финальное эссе по НИС',
    dueDay: 33,
    requiredEffort: 360,
  },
  {
    id: 'histphil-essay',
    courseId: 'histphil',
    assessmentId: 'essay',
    title: 'Эссе по истории философии',
    dueDay: 26,
    requiredEffort: 300,
  },
  {
    id: 'ontology-essay',
    courseId: 'ontology',
    assessmentId: 'essay',
    title: 'Итоговое эссе по онтологии',
    dueDay: 38,
    requiredEffort: 420,
  },
]

export const STUDY_CONFIG: StudyConfig = {
  courses: COURSES,
  schedule: SCHEDULE,
  essays: ESSAYS,
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- courses`
Expected: PASS, 10 тестов.

Если тест на сумму весов падает — проверить формулу по `research/student-life.md`, а не подгонять числа наугад.

- [ ] **Step 5: Прогнать всё**

Run: `npm test && npm run build`
Expected: всё зелёное.

- [ ] **Step 6: Коммит**

```bash
git add src/content/study
git commit -m "feat: пять дисциплин первого курса с настоящими формулами ВШЭ"
```

---

## Что даёт этот этап

Учебная система, в которой оценки считаются по настоящим правилам ВШЭ: взвешенные элементы контроля, посещаемость с опозданиями, семинарские выступления, эссе с дедлайном и соблазном списать, накопленная оценка и максимально достижимый итог.

Всё это чистая симуляция, покрытая тестами. Подключение к 3D-миру и интерфейсу — следующий этап.

## Следующие этапы

- **Этап 3 — преподаватели и диалоги:** шесть персонажей с внешностью, характерами, репликами, узловые диалоги, отношения по двум измерениям, шкала философских фракций.
- **Этап 4 — жизнь вокруг:** остальные этажи, лифт и лестница как переходы, автономные NPC с расписанием, однокурсники-архетипы из настоящих кружков.
- **Этап 5 — рамка:** общага и дорога, сессия и экзамены, эпилоги, сохранения, процедурный звук.
