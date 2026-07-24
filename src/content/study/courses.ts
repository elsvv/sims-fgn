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
