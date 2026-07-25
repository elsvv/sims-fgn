/**
 * Навыки студента. Шкала 0..10 — десятибалльная, как оценки в ВШЭ,
 * и это не случайность: игрок читает уровень навыка теми же глазами,
 * что и оценку в ведомости.
 *
 * Состав и источники прокачки взяты из дизайн-документа, раздел 4.3.
 */
export type SkillId =
  | 'ancientLanguages'
  | 'logic'
  | 'germanClassics'
  | 'academicWriting'
  | 'eloquence'
  | 'endurance'

export type Skills = Record<SkillId, number>

export const MIN_SKILL = 0
export const MAX_SKILL = 10

export const SKILL_IDS: readonly SkillId[] = [
  'ancientLanguages',
  'logic',
  'germanClassics',
  'academicWriting',
  'eloquence',
  'endurance',
]

/**
 * Опознаёт идентификатор навыка среди произвольных строк.
 *
 * Нужно там, где навык назван данными, а не кодом: эффект диалоговой реплики
 * приходит из каталога с полем `id: string`. Опечатка в контенте не должна
 * ни падать, ни молча качать несуществующий навык.
 */
export function isSkillId(value: string): value is SkillId {
  return (SKILL_IDS as readonly string[]).includes(value)
}

export const SKILL_LABELS: Record<SkillId, string> = {
  ancientLanguages: 'Древние языки',
  logic: 'Логика',
  germanClassics: 'Немецкая классика',
  academicWriting: 'Академическое письмо',
  eloquence: 'Красноречие',
  endurance: 'Выносливость',
}

/**
 * Откуда навык растёт. Текст показывается игроку подсказкой,
 * поэтому написан так, как ответил бы однокурсник, а не справка.
 * Содержание — из таблицы дизайн-документа, раздел 4.3.
 */
export const SKILL_SOURCES: Record<SkillId, string> = {
  ancientLanguages: 'Пары и домашние задания у Алиевой, «Антибарбари», библиотека',
  logic: 'Задачи Долгорукова, споры о формальных вопросах',
  germanClassics: 'Чтение Канта, Гегеля и Хайдеггера, семинары Михайловского',
  academicWriting: 'Написание эссе и консультации',
  eloquence: 'Выступления на семинарах и споры',
  endurance: 'Недосып, бары, дедлайны — качается через страдание',
}

/**
 * Какая доля усилия доходит до навыка на потолке шкалы.
 * Ноль здесь поставить нельзя: тогда десятка стала бы недостижима
 * ни за какое конечное время, а она должна быть достижима — просто дорого.
 */
const CEILING_EFFICIENCY = 0.1

/** Крутизна замедления. Больше единицы — прирост проседает быстрее линейного. */
const FALLOFF = 1.5

function clamp(value: number): number {
  return Math.min(MAX_SKILL, Math.max(MIN_SKILL, value))
}

/**
 * Какая доля вложенного усилия превращается в навык на данном уровне, 0..1.
 *
 * Прокачка замедляется на высоких уровнях, и это прямо следует из
 * правил ВШЭ: восьмёрка — потолок честной работы, девятка и десятка
 * требуют результата, превышающего программу. Одно и то же занятие
 * поднимает новичка заметно быстрее, чем того, кто уже почти всё умеет.
 */
export function learningEfficiency(level: number): number {
  const headroom = (MAX_SKILL - clamp(level)) / MAX_SKILL
  return CEILING_EFFICIENCY + (1 - CEILING_EFFICIENCY) * Math.pow(headroom, FALLOFF)
}

export function createSkills(overrides: Partial<Skills> = {}): Skills {
  const skills = {} as Skills
  for (const id of SKILL_IDS) {
    skills[id] = clamp(overrides[id] ?? MIN_SKILL)
  }
  return skills
}

/**
 * Возвращает новый объект навыков с начисленным приростом.
 *
 * Положительное усилие проходит через замедление на высоких уровнях,
 * отрицательное применяется как есть: терять навык — не то же самое,
 * что учиться, и тормозить потерю нечему.
 */
export function gainSkill(skills: Skills, id: SkillId, amount: number): Skills {
  const current = skills[id]
  const applied = amount > 0 ? amount * learningEfficiency(current) : amount
  return { ...skills, [id]: clamp(current + applied) }
}

/** Словесная оценка уровня — то, как игрок описал бы себя вслух. */
export function skillLevelLabel(value: number): string {
  if (value < 1) return 'не начинал'
  if (value < 3) return 'новичок'
  if (value < 5) return 'кое-что понимает'
  if (value < 7) return 'уверенно'
  if (value < 9) return 'сильная сторона'
  return 'выше программы'
}
