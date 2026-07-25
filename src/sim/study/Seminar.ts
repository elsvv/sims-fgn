import {
  isAvailable,
  type DialogueContext,
  type DialogueRequirement,
} from '../dialogue/Dialogue'
import { MAX_SKILL, type SkillId, type Skills } from '../player/Skills'
import { affinityBonus } from '../social/Faction'
import type { AttendanceMark } from './Attendance'
import { MAX_GRADE, PASSING_GRADE } from './Course'
import { roundGrade } from './Gradebook'
import type { Lesson } from './Schedule'

/**
 * Выступление на семинаре — центральное учебное действие игры.
 *
 * Дизайн-документ, раздел 5.2: «Главный источник Уважения и главный риск».
 * Риск здесь не метафора, а устройство модуля: игрок выбирает не «выступить
 * или нет», а КАК выступить, и каждый способ по-своему обменивает
 * безопасность на потолок оценки.
 *
 * Всё, что здесь есть, — чистые функции и данные. Варианты выступления
 * лежат в src/content: сколько их и что каждый требует — вопрос контента,
 * а не кода.
 */

/** Вариант выступления: как именно студент открывает рот. */
export interface SeminarOption {
  id: string
  /** Подпись кнопки: что игрок собирается сделать. */
  label: string
  /** Чем это обернётся. Игрок должен видеть ставку до того, как её сделал. */
  hint: string
  /**
   * Навыки, на которых держится сам способ говорить. Пустой список —
   * способ, которому не нужно ничего, кроме знания предмета.
   */
  skills: readonly SkillId[]
  /**
   * Сдвиг по шкале традиций. При opposeTeacher это величина сдвига,
   * а направление считается от позиции преподавателя.
   */
  factionShift: number
  /**
   * Спор: сносит в сторону, противоположную преподавателю.
   *
   * Спорят всегда с кем-то конкретным, поэтому направление нельзя записать
   * в данных числом: спор с Долгоруковым делает вас континентальным,
   * спор с Михайловским — аналитиком, а вариант выступления один и тот же.
   */
  opposeTeacher?: boolean
  /** Худший исход этого способа, 0..10. Осторожный пересказ не проваливается в ноль. */
  floor: number
  /** Лучший исход, 0..10. За пересказ десятку не ставят никогда. */
  ceiling: number
  /** Чем вариант открывается. Без требований доступен всегда. */
  requires?: DialogueRequirement
}

/**
 * Веса слагаемых качества выступления. Сумма равна единице, поэтому
 * качество всегда лежит в 0..1 и читается как доля от идеала.
 *
 * Подготовка весит больше половины: это учебная игра, и первым делом
 * она должна вознаграждать за прочитанное. Настроение весит меньше всех —
 * оно портит хороший ответ, но не заменяет его.
 */
export const PREPARATION_WEIGHT = 0.55
export const MOOD_WEIGHT = 0.2
export const AFFINITY_WEIGHT = 0.25

/** Насколько знание дисциплины важнее владения самим приёмом. */
export const COURSE_SKILL_WEIGHT = 0.4
export const MANNER_SKILL_WEIGHT = 0.6

/** Сколько уважения стоит один балл сверх проходного. */
export const RESPECT_PER_GRADE_POINT = 1.5

/** Базовый прирост навыка за одно выступление. */
export const SEMINAR_SKILL_GAIN = 0.35

/** Какая доля базового прироста достаётся навыкам самого приёма. */
const MANNER_GAIN_SHARE = 0.6

/**
 * Идентификаторы модификаторов настроения, которые вешает выступление.
 *
 * Сами тексты живут в каталоге контента: sim объявляет, что ему нужно,
 * и не знает, как это подписано. Тест каталога следит за тем, чтобы обе
 * записи там были.
 */
export const SEMINAR_SUCCESS_MOODLET = 'spokeAtSeminar'
export const SEMINAR_FAILURE_MOODLET = 'failedAtSeminar'

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Всё, из чего складывается оценка за выступление. */
export interface SeminarContext {
  option: SeminarOption
  skills: Skills
  /** Навыки, относящиеся к дисциплине. Пусто — дисциплина ни на что не опирается. */
  courseSkills: readonly SkillId[]
  /** Настроение игрока, 0..100. */
  mood: number
  /** Близость взглядов с преподавателем, −1..1. */
  affinity: number
  /** Где преподаватель стоит на шкале традиций. Нужно, чтобы знать, куда сносит спор. */
  teacherPosition: number
}

/** Средний уровень перечисленных навыков, 0..10. Пустой список — ноль. */
export function averageSkill(skills: Skills, ids: readonly SkillId[]): number {
  if (ids.length === 0) return 0
  let sum = 0
  for (const id of ids) sum += skills[id]
  return sum / ids.length
}

/**
 * Подготовленность к этому выступлению, 0..1.
 *
 * Складывается из двух вещей: что студент знает по предмету и насколько
 * владеет выбранным приёмом. Пустой список с любой стороны не тянет вниз,
 * а выпадает из расчёта — иначе осторожный пересказ, которому не нужен
 * ни один навык, был бы обречён на ноль по половине формулы.
 */
export function seminarPreparation(
  skills: Skills,
  courseSkills: readonly SkillId[],
  optionSkills: readonly SkillId[],
): number {
  let sum = 0
  let weight = 0

  if (courseSkills.length > 0) {
    sum += COURSE_SKILL_WEIGHT * averageSkill(skills, courseSkills)
    weight += COURSE_SKILL_WEIGHT
  }
  if (optionSkills.length > 0) {
    sum += MANNER_SKILL_WEIGHT * averageSkill(skills, optionSkills)
    weight += MANNER_SKILL_WEIGHT
  }

  if (weight === 0) return 0
  return clamp01(sum / weight / MAX_SKILL)
}

/**
 * Качество выступления, 0..1, — то самое место, где сходятся все три системы игры.
 *
 * `качество = 0.55 · подготовка + 0.2 · настроение + 0.25 · близость взглядов`
 *
 * Близость приведена к 0..1: полный чужак даёт ноль, единомышленник —
 * единицу. Отсюда прямо следует главное правило шкалы традиций:
 * всеобщим любимцем стать нельзя, и на семинаре это стоит баллов.
 */
export function speechQuality(context: SeminarContext): number {
  const preparation = seminarPreparation(
    context.skills,
    context.courseSkills,
    context.option.skills,
  )
  const mood = clamp01(context.mood / 100)
  const closeness = clamp01((Math.min(1, Math.max(-1, context.affinity)) + 1) / 2)

  return clamp01(
    PREPARATION_WEIGHT * preparation + MOOD_WEIGHT * mood + AFFINITY_WEIGHT * closeness,
  )
}

/**
 * Оценка за выступление, целое 0..10.
 *
 * Качество растягивается на диапазон выбранного способа: `floor..ceiling`.
 * Поэтому выбор варианта — это выбор ставки, а не выбор украшения.
 * Неподготовленному выгоден осторожный пересказ с его гарантированной
 * тройкой, подготовленному — спор, у которого потолок десятка.
 */
export function seminarGrade(context: SeminarContext): number {
  const { floor, ceiling } = context.option
  return roundGrade(floor + (ceiling - floor) * speechQuality(context))
}

/**
 * Прирост уважения преподавателя.
 *
 * Отсчитывается от проходного балла: четвёрка не меняет ничего, десятка
 * даёт много, ноль отнимает. Прирост множится на близость взглядов —
 * тот же ответ у своего стоит вчетверо дороже, чем у чужого. Потеря идёт
 * в полном размере у всех: общие взгляды не защищают от провала.
 */
export function seminarRespect(grade: number, affinityValue: number): number {
  const base = (grade - PASSING_GRADE) * RESPECT_PER_GRADE_POINT
  return base > 0 ? base * affinityBonus(affinityValue) : base
}

/**
 * Куда сдвинет игрока по шкале традиций.
 *
 * У обычного варианта направление записано в данных. У спора оно считается:
 * прочь от того, с кем спорят. Преподаватель ровно в нуле шкалы никого
 * никуда не сносит — с человеком без лагеря спорят о деле, а не о лагере.
 */
export function seminarFactionShift(option: SeminarOption, teacherPosition: number): number {
  if (!option.opposeTeacher) return option.factionShift
  if (teacherPosition === 0) return 0
  return -Math.sign(teacherPosition) * Math.abs(option.factionShift)
}

export interface SkillGain {
  id: SkillId
  amount: number
}

/**
 * Что выступление даёт навыкам.
 *
 * Красноречие качается всегда: вслух при всех говорили в любом случае,
 * и провал учит этому не меньше успеха. Навыки самого приёма растут только
 * при удачном выступлении — неудачный разбор текста ничему не учит,
 * кроме того, что читать надо было раньше.
 */
export function seminarSkillGains(option: SeminarOption, grade: number): SkillGain[] {
  const scale = 0.5 + grade / (2 * MAX_GRADE)
  const gains = new Map<SkillId, number>()

  const add = (id: SkillId, amount: number): void => {
    gains.set(id, (gains.get(id) ?? 0) + amount)
  }

  add('eloquence', SEMINAR_SKILL_GAIN * scale)
  if (grade >= PASSING_GRADE) {
    for (const id of option.skills) add(id, SEMINAR_SKILL_GAIN * MANNER_GAIN_SHARE * scale)
  }

  return [...gains].map(([id, amount]) => ({ id, amount }))
}

/** Всё, что случилось из-за выступления. Применяет это мир, а не эта функция. */
export interface SeminarResult {
  optionId: string
  /** Оценка, целое 0..10. */
  grade: number
  /** Оценка не ниже проходной. */
  success: boolean
  /** Подготовленность, 0..1 — чтобы можно было объяснить оценку. */
  preparation: number
  /** Качество, 0..1. */
  quality: number
  respect: number
  factionShift: number
  skillGains: readonly SkillGain[]
  /** Какой модификатор настроения повесить. */
  moodletId: string
}

/** Считает результат выступления целиком. Ничего не меняет. */
export function performSpeech(context: SeminarContext): SeminarResult {
  const grade = seminarGrade(context)
  const success = grade >= PASSING_GRADE

  return {
    optionId: context.option.id,
    grade,
    success,
    preparation: seminarPreparation(
      context.skills,
      context.courseSkills,
      context.option.skills,
    ),
    quality: speechQuality(context),
    respect: seminarRespect(grade, context.affinity),
    factionShift: seminarFactionShift(context.option, context.teacherPosition),
    skillGains: seminarSkillGains(context.option, grade),
    moodletId: success ? SEMINAR_SUCCESS_MOODLET : SEMINAR_FAILURE_MOODLET,
  }
}

/* ------------------------------------------------------------------ */
/* Когда выступать можно                                               */
/* ------------------------------------------------------------------ */

export type SeminarRefusal =
  | 'notSeminar'
  | 'lecture'
  | 'wrongRoom'
  | 'notMarked'
  | 'alreadySpoke'
  | 'unknownOption'
  | 'lockedOption'

/**
 * Почему выступить нельзя — теми словами, которые увидит игрок.
 *
 * Лекция вынесена из общего «сейчас не семинар» отдельной причиной, и это
 * не косметика. Первокурсник, у которого только что получилось выступить
 * у Алиевой, идёт на следующую пару и не находит там кнопки. Молчание
 * в этом месте читается как поломка, а не как правило: человек видел, что
 * механика работает, а теперь её нет. Названная причина превращает
 * пропажу кнопки в устройство мира — на лекции слушают.
 */
export const SEMINAR_REFUSALS: Record<SeminarRefusal, string> = {
  notSeminar: 'Сейчас не семинар',
  lecture: 'Идёт лекция: здесь слушают, а выступают на семинарах',
  wrongRoom: 'Вы не в той аудитории',
  notMarked: 'Вас ещё не отметили на паре',
  alreadySpoke: 'Вы уже выступали — слово дают раз за пару',
  unknownOption: 'Такого выступления нет',
  lockedOption: 'Для этого не хватает подготовки',
}

/** Снимок мира, которого достаточно, чтобы решить вопрос о выступлении. */
export interface SeminarSituation {
  /** Занятие, идущее прямо сейчас, или null. */
  lesson: Lesson | null
  /** Помещение, где стоит игрок. */
  room: string | null
  /** Отметка о присутствии на этом занятии или null, если её ещё нет. */
  mark: AttendanceMark | null
  alreadySpoke: boolean
}

/**
 * Что мешает выступить прямо сейчас. null — ничто не мешает.
 *
 * Порядок проверок — порядок полезности ответа: сначала «пары нет», потом
 * «это лекция», потом «не в той аудитории», и только потом бумажные
 * причины. Отметка о присутствии обязательна не ради бюрократии: она
 * ставится по факту того, что персонаж дошёл до аудитории, пока пара идёт.
 * Выступать, не придя, нельзя, и это то же правило, что и в жизни.
 */
export function seminarRefusal(situation: SeminarSituation): SeminarRefusal | null {
  const { lesson, room, mark, alreadySpoke } = situation

  if (!lesson) return 'notSeminar'
  if (lesson.kind !== 'seminar') return 'lecture'
  if (room === null || room !== lesson.room) return 'wrongRoom'
  if (mark === null || mark === 'absent') return 'notMarked'
  if (alreadySpoke) return 'alreadySpoke'
  return null
}

/** Вариант без единого условия доступен всегда — панель не должна пустеть. */
export function isUnconditionalOption(option: SeminarOption): boolean {
  return option.requires === undefined || Object.keys(option.requires).length === 0
}

/** Открыт ли вариант при нынешних навыках, взглядах и отношениях. */
export function isSeminarOptionAvailable(
  option: SeminarOption,
  context: DialogueContext,
): boolean {
  return option.requires ? isAvailable(option.requires, context) : true
}

/** Варианты, доступные игроку прямо сейчас. */
export function availableSeminarOptions(
  options: readonly SeminarOption[],
  context: DialogueContext,
): SeminarOption[] {
  return options.filter((option) => isSeminarOptionAvailable(option, context))
}

/* ------------------------------------------------------------------ */
/* Ответ преподавателя                                                 */
/* ------------------------------------------------------------------ */

/**
 * Выбирает реплику из набора без обращения к случайности.
 *
 * Случайность здесь была бы вредна дважды: тесты стали бы плавающими,
 * а игрок, переигравший одну и ту же сцену, увидел бы разное там, где
 * ничего не изменилось. Одна и та же ситуация отвечает одними и теми же
 * словами, а разные ситуации разными: в затравку идут номер занятия,
 * вариант выступления и оценка.
 */
export function pickLine(lines: readonly string[], seed: string): string | null {
  if (lines.length === 0) return null
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000003
  }
  return lines[hash % lines.length] ?? null
}

/* ------------------------------------------------------------------ */
/* Проверка данных                                                     */
/* ------------------------------------------------------------------ */

/** Возвращает список ошибок варианта. Пустой список означает, что он корректен. */
export function validateSeminarOption(option: SeminarOption): string[] {
  const errors: string[] = []
  const where = `Вариант «${option.id}»`

  if (option.label.trim() === '') errors.push(`${where}: нет подписи`)
  if (option.hint.trim() === '') errors.push(`${where}: не сказано, что он даёт`)

  for (const [name, value] of [
    ['нижняя граница', option.floor],
    ['верхняя граница', option.ceiling],
  ] as const) {
    if (value < 0 || value > MAX_GRADE) {
      errors.push(`${where}: ${name} ${value} вне шкалы 0..${MAX_GRADE}`)
    }
  }

  if (option.ceiling <= option.floor) {
    errors.push(`${where}: лучший исход не выше худшего — выбор ничего не решает`)
  }

  if (option.opposeTeacher && option.factionShift < 0) {
    errors.push(
      `${where}: у спора направление считается от преподавателя, поэтому сдвиг задаётся величиной`,
    )
  }

  return errors
}

/**
 * Проверяет набор вариантов целиком.
 *
 * Главная проверка — последняя: хотя бы один вариант обязан быть
 * безусловным. Набор, где всё что-то требует, однажды откроется
 * первокурснику пустой панелью, из которой нельзя ни выступить,
 * ни понять почему.
 */
export function validateSeminarOptions(options: readonly SeminarOption[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const option of options) {
    if (seen.has(option.id)) errors.push(`Вариант «${option.id}» повторяется`)
    seen.add(option.id)
    errors.push(...validateSeminarOption(option))
  }

  if (options.length > 0 && !options.some(isUnconditionalOption)) {
    errors.push('Нет ни одного безусловного варианта — панель может оказаться пустой')
  }

  return errors
}
