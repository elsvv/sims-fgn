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
}

const FACTION_UP = 'нужно быть ближе к континентальной традиции'
const FACTION_DOWN = 'нужно быть ближе к аналитической традиции'
const RESPECT = 'нужно, чтобы вас ценили больше'
const AFFECTION = 'нужно, чтобы к вам лучше относились'
const BOOK = 'нужно прочитать книгу'

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
