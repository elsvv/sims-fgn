import { describe, expect, it } from 'vitest'
import type { Course, CourseCatalog } from './Course'
import type { EssayTask } from './Essay'
import { occurrenceId, type Schedule } from './Schedule'
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

/** Один и тот же понедельничный семинар на первой и на второй неделе. */
const FIRST_MONDAY_GREEK = occurrenceId(0, 'g-mon')
const NEXT_MONDAY_GREEK = occurrenceId(7, 'g-mon')

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
    study.attendLesson(occurrenceId(0, 'g-mon'), 'greek', 'present')
    study.attendLesson(occurrenceId(7, 'g-mon'), 'greek', 'absent')
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

describe('StudyState: выступления на семинарах', () => {
  it('мир без вариантов выступления отдаёт пустой список', () => {
    expect(new StudyState(CONFIG).seminarOptions).toEqual([])
  })

  it('отдаёт варианты, объявленные в конфигурации', () => {
    const options = [
      {
        id: 'retell',
        label: 'Пересказать прочитанное',
        hint: 'Безопасно и невысоко.',
        skills: [],
        factionShift: 0,
        floor: 3,
        ceiling: 7,
      },
    ]
    const study = new StudyState({ ...CONFIG, seminarOptions: options })
    expect(study.seminarOptions).toEqual(options)
  })

  it('на новой паре игрок ещё не выступал', () => {
    expect(new StudyState(CONFIG).hasSpokenAt(FIRST_MONDAY_GREEK)).toBe(false)
  })

  it('выступление помечает пару и ставит оценку', () => {
    const study = new StudyState(CONFIG)
    study.speakAt(FIRST_MONDAY_GREEK, 'greek', 8)
    expect(study.hasSpokenAt(FIRST_MONDAY_GREEK)).toBe(true)
    expect(study.gradebook.gradeFor('greek', 'classwork')).toBe(8)
  })

  it('пометка стоит на конкретной паре, а не на курсе', () => {
    const study = new StudyState(CONFIG)
    study.speakAt(FIRST_MONDAY_GREEK, 'greek', 8)
    expect(study.hasSpokenAt(occurrenceId(0, 'l-mon'))).toBe(false)
  })

  it('пометка не переезжает на ту же пару следующей недели', () => {
    const study = new StudyState(CONFIG)
    study.speakAt(FIRST_MONDAY_GREEK, 'greek', 8)
    expect(study.hasSpokenAt(NEXT_MONDAY_GREEK)).toBe(false)
  })

  it('оценки за разные пары усредняются, а не перезаписываются', () => {
    const study = new StudyState(CONFIG)
    study.speakAt(FIRST_MONDAY_GREEK, 'greek', 10)
    study.speakAt(NEXT_MONDAY_GREEK, 'greek', 4)
    expect(study.gradebook.gradeFor('greek', 'classwork')).toBe(7)
  })
})
