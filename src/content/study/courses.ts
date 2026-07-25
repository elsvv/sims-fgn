import type { CourseCatalog } from '../../sim/study/Course'
import type { EssayTask } from '../../sim/study/Essay'
import type { Schedule } from '../../sim/study/Schedule'
import type { StudyConfig } from '../../sim/study/StudyState'
import { SEMINAR_OPTIONS } from './seminarOptions'

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
    skillIds: ['ancientLanguages'],
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
    skillIds: ['ancientLanguages', 'academicWriting'],
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
    skillIds: ['logic'],
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
    skillIds: ['germanClassics'],
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
    skillIds: ['germanClassics', 'academicWriting'],
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.4, kind: 'seminar', blocking: false },
      { id: 'essay', label: 'Итоговое эссе', weight: 0.6, kind: 'essay', blocking: false },
    ],
  },

  /*
   * «История» стоит в учебном плане первого курса отдельной дисциплиной,
   * и среди её преподавателей — Марей (research/student-life.md, §2.1).
   * Медиевист, читающий историю первокурсникам-философам, — это ровно тот
   * курс, где древние языки нужны не для экзамена, а чтобы открыть источник.
   */
  history: {
    id: 'history',
    title: 'История',
    short: 'История',
    teacherId: 'marey',
    skillIds: ['ancientLanguages'],
    // Формула «прочих» дисциплин: 0.6 накопленная + 0.4 экзамен.
    assessments: [
      { id: 'seminars', label: 'Работа на семинарах', weight: 0.35, kind: 'seminar', blocking: false },
      { id: 'sources', label: 'Разбор источников', weight: 0.25, kind: 'homework', blocking: false },
      { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
    ],
  },

  /*
   * «Цифровая грамотность» — тоже настоящий курс первого курса, и его
   * тоже вёл Долгоруков (research/student-life.md, §2.1). Логик, который
   * учит философов работать с данными, — лучшая иллюстрация к наблюдению
   * из того же раздела: «а я вообще-то на философию поступал».
   */
  digital: {
    id: 'digital',
    title: 'Цифровая грамотность',
    short: 'Цифровая грамотность',
    teacherId: 'dolgorukov',
    skillIds: ['logic'],
    assessments: [
      { id: 'practice', label: 'Работа на практикумах', weight: 0.4, kind: 'seminar', blocking: false },
      { id: 'quizzes', label: 'Проверочные', weight: 0.2, kind: 'quiz', blocking: false },
      { id: 'exam', label: 'Экзамен', weight: 0.4, kind: 'exam', blocking: false },
    ],
  },
}

/**
 * Расписание модуля. Учебная неделя шестидневная: 0 — понедельник, 5 — суббота.
 *
 * Все пары стоят в двух аудиториях второго этажа корпуса А — единственного
 * этажа, который в игре пока построен. Пара в аудитории, куда нельзя дойти,
 * означала бы автоматический прогул: посещаемость считается по тому, где
 * стоит персонаж. Что аудитории существуют на этаже, сторожит courses.test.ts.
 * Настоящие номера аудиторий ФГН с третьего этажа — А-308, А-312, А-323
 * (research/building.md) — вернутся в расписание вместе с самим этажом.
 *
 * КАК СОБРАН ДЕНЬ. Три-четыре пары, и в каждом дне есть окно не меньше
 * полутора часов. Это не украшение сетки, а игровой ресурс: дизайн-документ,
 * §3 — «окна между парами — свободное время, главный ресурс игрока».
 * День из двух пар не даёт студенту повода прожить его, день из семи
 * не оставляет на это времени. Подряд, через одну перемену, стоят самое
 * большее две пары.
 *
 * ПАРЫ ПОДРЯД — В ОДНОЙ АУДИТОРИИ. Перемена — десять минут, а коридор
 * второго этажа длиной двадцать два метра, и персонаж проходит примерно
 * клетку в игровую минуту. Между А-204 и А-206 идти дольше, чем длится
 * перемена: поставить их подряд в разных концах этажа значило бы выдать
 * опоздание за расписание. Через обед и через окно аудитория меняется
 * свободно.
 *
 * КАК РАЗЛОЖЕНЫ КУРСЫ. У каждого ровно три занятия в неделю, и ни один
 * не собран в один день. Там, где у дисциплины есть лекция, она стоит
 * раньше её семинаров: сначала слушают, потом обсуждают. Язык и оба НИСа
 * идут одними семинарами — так они устроены и в жизни.
 *
 * ГРЕЧЕСКИЙ ПО СУББОТАМ — не выдумка ради заполнения дня: семинары
 * греко-латинского клуба «Антибарбар», основанного Алиевой, шли именно
 * по субботам (research/alieva.md).
 */
export const SCHEDULE: Schedule = [
  // Понедельник: 09:00, 10:30 — окно два часа — 13:50, 15:20.
  { id: 'greek-mon', courseId: 'greek', kind: 'seminar', weekday: 0, period: 0, room: 'А-204' },
  { id: 'histphil-mon', courseId: 'histphil', kind: 'lecture', weekday: 0, period: 1, room: 'А-204' },
  { id: 'logic-mon', courseId: 'logic', kind: 'lecture', weekday: 0, period: 3, room: 'А-206' },
  { id: 'history-mon', courseId: 'history', kind: 'lecture', weekday: 0, period: 4, room: 'А-206' },

  // Вторник: 09:00 — окно два часа — 12:20, 13:50 — окно — 16:50.
  { id: 'digital-tue', courseId: 'digital', kind: 'lecture', weekday: 1, period: 0, room: 'А-206' },
  { id: 'nis-tue', courseId: 'nis', kind: 'seminar', weekday: 1, period: 2, room: 'А-204' },
  { id: 'ontology-tue', courseId: 'ontology', kind: 'seminar', weekday: 1, period: 3, room: 'А-204' },
  { id: 'histphil-tue', courseId: 'histphil', kind: 'lecture', weekday: 1, period: 5, room: 'А-206' },

  // Среда: 10:30, обед, 12:20 — окно — 15:20.
  { id: 'logic-wed', courseId: 'logic', kind: 'seminar', weekday: 2, period: 1, room: 'А-206' },
  { id: 'greek-wed', courseId: 'greek', kind: 'seminar', weekday: 2, period: 2, room: 'А-204' },
  { id: 'nis-wed', courseId: 'nis', kind: 'seminar', weekday: 2, period: 4, room: 'А-204' },

  // Четверг: 09:00, 10:30 — окно два часа — 13:50, 15:20.
  { id: 'digital-thu', courseId: 'digital', kind: 'seminar', weekday: 3, period: 0, room: 'А-204' },
  { id: 'histphil-thu', courseId: 'histphil', kind: 'seminar', weekday: 3, period: 1, room: 'А-204' },
  { id: 'history-thu', courseId: 'history', kind: 'seminar', weekday: 3, period: 3, room: 'А-206' },
  { id: 'ontology-thu', courseId: 'ontology', kind: 'seminar', weekday: 3, period: 4, room: 'А-206' },

  // Пятница: 09:00 — окно два часа — 12:20, 13:50.
  { id: 'history-fri', courseId: 'history', kind: 'seminar', weekday: 4, period: 0, room: 'А-204' },
  { id: 'logic-fri', courseId: 'logic', kind: 'seminar', weekday: 4, period: 2, room: 'А-206' },
  { id: 'nis-fri', courseId: 'nis', kind: 'seminar', weekday: 4, period: 3, room: 'А-206' },

  // Суббота: 10:30, обед, 12:20 — окно — 15:20. Греческий по субботам —
  // тот самый день «Антибарбара».
  { id: 'greek-sat', courseId: 'greek', kind: 'seminar', weekday: 5, period: 1, room: 'А-204' },
  { id: 'digital-sat', courseId: 'digital', kind: 'seminar', weekday: 5, period: 2, room: 'А-204' },
  { id: 'ontology-sat', courseId: 'ontology', kind: 'seminar', weekday: 5, period: 4, room: 'А-206' },
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
  seminarOptions: SEMINAR_OPTIONS,
}
