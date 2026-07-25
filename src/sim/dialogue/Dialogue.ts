import type { Relationship } from '../social/Relationship'

/** Всё, что нужно знать, чтобы решить, доступна ли реплика. */
export interface DialogueContext {
  /** Уровни навыков по идентификаторам, 0..10. */
  skills: Record<string, number>
  /** Позиция игрока на шкале традиций. */
  faction: number
  relationship: Relationship
  /** Идентификаторы прочитанных книг. */
  readBooks: string[]
  day: number
}

export interface DialogueRequirement {
  skillId?: string
  skillMin?: number
  factionMin?: number
  factionMax?: number
  respectMin?: number
  affectionMin?: number
  book?: string
}

export interface DialogueEffects {
  respect?: number
  affection?: number
  /** Сдвиг по шкале традиций. */
  faction?: number
  /** Прирост навыка: идентификатор и величина. */
  skill?: { id: string; amount: number }
  /** Оценка за выступление, 0..10 — если реплика прозвучала на семинаре. */
  grade?: number
}

export interface DialogueOption {
  id: string
  /** Что говорит игрок. */
  text: string
  requires?: DialogueRequirement
  effects: DialogueEffects
  /** Что отвечает собеседник. */
  reply: string
}

export interface DialogueNode {
  id: string
  speakerId: string
  /** Реплика собеседника, открывающая разговор. */
  prompt: string
  options: DialogueOption[]
}

export type DialogueCatalog = Record<string, DialogueNode>

/**
 * Реплика без единого условия. Пустой объект требований — тоже без условий:
 * `isAvailable({}, ...)` всегда истинно, и проверяльщик обязан считать
 * такую реплику безусловной, иначе он ловит воображаемые ошибки.
 */
export function isUnconditional(option: DialogueOption): boolean {
  return option.requires === undefined || Object.keys(option.requires).length === 0
}

export function isAvailable(
  requirement: DialogueRequirement,
  context: DialogueContext,
): boolean {
  if (requirement.skillId !== undefined) {
    const level = context.skills[requirement.skillId] ?? 0
    if (level < (requirement.skillMin ?? 0)) return false
  }
  if (requirement.factionMin !== undefined && context.faction < requirement.factionMin) {
    return false
  }
  if (requirement.factionMax !== undefined && context.faction > requirement.factionMax) {
    return false
  }
  if (
    requirement.respectMin !== undefined &&
    context.relationship.respect < requirement.respectMin
  ) {
    return false
  }
  if (
    requirement.affectionMin !== undefined &&
    context.relationship.affection < requirement.affectionMin
  ) {
    return false
  }
  if (requirement.book !== undefined && !context.readBooks.includes(requirement.book)) {
    return false
  }
  return true
}

/**
 * Реплики, доступные игроку прямо сейчас.
 * Реплика без условий доступна всегда — у игрока никогда не должно
 * оказаться пустого меню.
 */
export function availableOptions(
  node: DialogueNode,
  context: DialogueContext,
): DialogueOption[] {
  return node.options.filter((option) =>
    option.requires ? isAvailable(option.requires, context) : true,
  )
}

/**
 * Возвращает список человекочитаемых ошибок узла.
 * Пустой список означает, что узел корректен.
 *
 * Главная проверка — последняя: у узла обязана быть хотя бы одна безусловная
 * реплика. Узел, все реплики которого что-то требуют, однажды откроется
 * игроку пустым меню, из которого нельзя ни ответить, ни выйти по-человечески.
 * Поймать это глазами нельзя — условий много и они разные, — поэтому ловим
 * тестом по всему каталогу.
 */
export function validateDialogueNode(node: DialogueNode): string[] {
  const errors: string[] = []
  const where = `Узел «${node.id}»`

  if (node.speakerId.trim() === '') errors.push(`${where}: не указан собеседник`)
  if (node.prompt.trim() === '') errors.push(`${where}: пустая реплика собеседника`)

  if (node.options.length === 0) {
    errors.push(`${where}: нет ни одной реплики игрока`)
    return errors
  }

  const seen = new Set<string>()
  for (const option of node.options) {
    if (seen.has(option.id)) {
      errors.push(`${where}: идентификатор реплики «${option.id}» повторяется`)
    }
    seen.add(option.id)

    if (option.text.trim() === '') errors.push(`${where}: у реплики «${option.id}» пустой текст`)
    if (option.reply.trim() === '') {
      errors.push(`${where}: на реплику «${option.id}» собеседник ничего не отвечает`)
    }
  }

  if (!node.options.some(isUnconditional)) {
    errors.push(
      `${where}: нет ни одной безусловной реплики — меню может оказаться пустым`,
    )
  }

  return errors
}

/**
 * Проверяет каталог целиком: каждый узел по отдельности плюс то,
 * что ключ каталога совпадает с идентификатором узла. Расхождение
 * ключа и идентификатора не ломает выборку по ключу, но ломает всё,
 * что ищет узел по его собственному id.
 */
export function validateDialogueCatalog(catalog: DialogueCatalog): string[] {
  const errors: string[] = []
  for (const [key, node] of Object.entries(catalog)) {
    if (node.id !== key) {
      errors.push(`Каталог: узел «${node.id}» лежит под ключом «${key}»`)
    }
    errors.push(...validateDialogueNode(node))
  }
  return errors
}
