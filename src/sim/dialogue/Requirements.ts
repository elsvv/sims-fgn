import { isSkillId, SKILL_NEEDS } from '../player/Skills'
import type { DialogueRequirement } from './Dialogue'

/**
 * Чего не хватает, чтобы сказать закрытую реплику, — человеческой фразой.
 *
 * Это оборотная сторона Consequences.ts. Там правило «никаких чисел» работает
 * после выбора, здесь — до: игрок должен понимать, что реплика существует
 * и чем она куплена, но не должен видеть порога вида «нужен навык ≥ 4».
 * Разница между «нужны древние языки» и «greek ≥ 4» — это разница между
 * подсказкой о мире и подсказкой о таблице.
 *
 * Модуль ничего не знает ни о цепочках, ни о содержимом каталогов: он
 * принимает требование и отдаёт слова. Названия книг живут в контенте
 * и приходят сюда параметром.
 */

/** Как называются вещи, на которые ссылаются требования. */
export interface RequirementLabels {
  /** Названия книг по идентификаторам: «phaedo» → «Платон. „Федон“». */
  books?: Readonly<Record<string, string>>
  /**
   * Подписи модификаторов настроения: «praised» → «Похвалил Михайловский».
   * Те же самые, что игрок видит в панели настроения.
   */
  moodlets?: Readonly<Record<string, string>>
  /**
   * Чем был прошлый разговор — глаголом, как его вспоминают:
   * «marey-restroom-opening» → «поговорить с Мареем у раковины».
   */
  conversations?: Readonly<Record<string, string>>
}

const FACTION_UP = 'нужно быть ближе к континентальной традиции'
const FACTION_DOWN = 'нужно быть ближе к аналитической традиции'
const RESPECT = 'нужно, чтобы вас ценили больше'
const AFFECTION = 'нужно, чтобы к вам лучше относились'
const BOOK = 'нужно прочитать книгу'
const MOODLET = 'нужно подходящее настроение'
const WITHOUT_MOODLET = 'мешает нынешнее настроение'
const VISITED = 'нужен разговор, которого у вас ещё не было'

/**
 * Отдельные части требования словами, по порядку.
 * Пустой список означает, что реплика ничем не заперта.
 */
export function requirementParts(
  requirement: DialogueRequirement,
  labels: RequirementLabels = {},
): string[] {
  const parts: string[] = []

  if (requirement.skillId !== undefined) {
    parts.push(
      isSkillId(requirement.skillId)
        ? SKILL_NEEDS[requirement.skillId]
        : `нужен навык «${requirement.skillId}»`,
    )
  }
  if (requirement.factionMin !== undefined) parts.push(FACTION_UP)
  if (requirement.factionMax !== undefined) parts.push(FACTION_DOWN)
  if (requirement.respectMin !== undefined) parts.push(RESPECT)
  if (requirement.affectionMin !== undefined) parts.push(AFFECTION)
  if (requirement.book !== undefined) {
    const title = labels.books?.[requirement.book]
    parts.push(title ? `нужно прочитать ${title}` : BOOK)
  }
  if (requirement.moodletId !== undefined) {
    const label = labels.moodlets?.[requirement.moodletId]
    parts.push(label ? `нужно, чтобы ещё держалось «${label}»` : MOODLET)
  }
  if (requirement.withoutMoodletId !== undefined) {
    const label = labels.moodlets?.[requirement.withoutMoodletId]
    parts.push(label ? `мешает «${label}»` : WITHOUT_MOODLET)
  }
  if (requirement.visitedNode !== undefined) {
    const memory = labels.conversations?.[requirement.visitedNode]
    parts.push(memory ? `нужно было раньше ${memory}` : VISITED)
  }

  return parts
}

/**
 * Всё требование одной фразой или null, если требовать нечего.
 *
 * Пустой объект требований — это отсутствие условий, а не условие,
 * которое нельзя выполнить: так же считает isAvailable, и расходиться
 * этим двум нельзя.
 */
export function describeRequirement(
  requirement: DialogueRequirement | undefined,
  labels: RequirementLabels = {},
): string | null {
  if (!requirement) return null
  const parts = requirementParts(requirement, labels)
  if (parts.length === 0) return null
  return parts.join(', ')
}
