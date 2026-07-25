import { canRomance, romanceForbiddenReason, type PersonProfile } from '../social/Romance'
import {
  addChanges,
  describeChoice,
  describeConversation,
  emptyTotals,
  type ConsequenceReport,
  type DialogueTone,
  type EffectTotals,
  type OutcomeReport,
  type SkillLabels,
} from './Consequences'
import { isAvailable, type DialogueContext, type DialogueEffects, type DialogueNode, type DialogueOption } from './Dialogue'

/**
 * Многошаговые разговоры поверх Dialogue.ts.
 *
 * Один узел с набором ответов — это реплика. Разговор — это цепочка узлов:
 * ответ ведёт к следующей реплике собеседника, та к новому выбору, и так
 * до одной из концовок. Dialogue.ts не переписан: узел и реплика здесь
 * расширяют его типы, а доступность по-прежнему считает isAvailable.
 */

export interface ChainEffects extends DialogueEffects {
  /**
   * Романтический интерес. Допустим только для вымышленных однокурсников —
   * см. sim/social/Romance.ts и validateChain с профилем собеседника.
   */
  romance?: number
}

export interface ChainOption extends DialogueOption {
  /** Каким тоном это сказано. Игрок видит намёк на тон до выбора. */
  tone: DialogueTone
  effects: ChainEffects
  /** Что произошло между вами и почему — человеческой фразой, без чисел. */
  consequence: string
  /** Куда идти дальше. Пустых переходов не бывает: разговор кончают концовки. */
  next: string
}

/** Смысл исхода: чем всё кончилось. */
export interface ChainEnding {
  id: string
  /** Краткое название исхода: «Братство по оружию». */
  title: string
  /** Что это значило для отношений. */
  summary: string
}

export interface ChainNode extends DialogueNode {
  options: ChainOption[]
  /** Заполнено — узел конечный: разговор на нём заканчивается. */
  ending?: ChainEnding
}

export interface DialogueChainData {
  id: string
  speakerId: string
  /** Обстановка и завязка: как игрок сюда попал. */
  intro?: string
  startId: string
  nodes: ChainNode[]
}

/** Реплики, доступные в узле цепочки прямо сейчас. */
export function availableChainOptions(
  node: ChainNode,
  context: DialogueContext,
): ChainOption[] {
  return node.options.filter((option) =>
    option.requires ? isAvailable(option.requires, context) : true,
  )
}

export type ChainProblemKind =
  | 'missing-start'
  | 'duplicate-node'
  | 'duplicate-option'
  | 'broken-link'
  | 'unreachable'
  | 'no-free-option'
  | 'dead-end'
  | 'cycle'
  | 'ending-with-options'
  | 'empty-ending'
  | 'no-endings'
  | 'romance-forbidden'

export interface ChainProblem {
  kind: ChainProblemKind
  nodeId?: string
  message: string
}

export interface ValidateOptions {
  /** Профиль собеседника — нужен, чтобы поймать романтику у преподавателя. */
  speaker?: PersonProfile
}

/**
 * Проверка всей цепочки: битые ссылки, недостижимые узлы, циклы,
 * узлы без единого безусловного ответа и концовки без смысла.
 * Возвращает список проблем — пустой, если всё в порядке.
 */
export function validateChain(
  chain: DialogueChainData,
  options: ValidateOptions = {},
): ChainProblem[] {
  const problems: ChainProblem[] = []
  const index = new Map<string, ChainNode>()

  for (const node of chain.nodes) {
    if (index.has(node.id)) {
      problems.push({
        kind: 'duplicate-node',
        nodeId: node.id,
        message: `Узел «${node.id}» описан дважды.`,
      })
      continue
    }
    index.set(node.id, node)
  }

  if (!index.has(chain.startId)) {
    problems.push({
      kind: 'missing-start',
      nodeId: chain.startId,
      message: `Стартовый узел «${chain.startId}» не найден в цепочке «${chain.id}».`,
    })
  }

  const speaker = options.speaker
  const romanceAllowed = canRomance(speaker)

  for (const node of index.values()) {
    const seen = new Set<string>()
    for (const option of node.options) {
      if (seen.has(option.id)) {
        problems.push({
          kind: 'duplicate-option',
          nodeId: node.id,
          message: `В узле «${node.id}» две реплики с идентификатором «${option.id}».`,
        })
      }
      seen.add(option.id)

      if (!index.has(option.next)) {
        problems.push({
          kind: 'broken-link',
          nodeId: node.id,
          message: `Реплика «${option.id}» узла «${node.id}» ведёт в несуществующий узел «${option.next}».`,
        })
      }

      if (speaker && !romanceAllowed && (option.effects.romance ?? 0) !== 0) {
        problems.push({
          kind: 'romance-forbidden',
          nodeId: node.id,
          message: `Реплика «${option.id}» узла «${node.id}» двигает романтический интерес. ${romanceForbiddenReason(speaker)}`,
        })
      }
    }

    if (node.ending) {
      if (node.options.length > 0) {
        problems.push({
          kind: 'ending-with-options',
          nodeId: node.id,
          message: `Узел «${node.id}» конечный, но из него всё ещё можно ответить.`,
        })
      }
      if (node.ending.title.trim() === '' || node.ending.summary.trim() === '') {
        problems.push({
          kind: 'empty-ending',
          nodeId: node.id,
          message: `У концовки узла «${node.id}» пустое название или пустой итог.`,
        })
      }
    } else if (node.options.length === 0) {
      problems.push({
        kind: 'dead-end',
        nodeId: node.id,
        message: `Узел «${node.id}» не помечен как конечный, но отвечать в нём нечем.`,
      })
    } else if (!node.options.some((option) => option.requires === undefined)) {
      problems.push({
        kind: 'no-free-option',
        nodeId: node.id,
        message: `В узле «${node.id}» нет ни одной безусловной реплики: игрок рискует остаться с пустым меню.`,
      })
    }
  }

  problems.push(...walk(chain, index))

  return problems
}

/** Обход графа: достижимость, циклы, наличие хотя бы одной концовки. */
function walk(chain: DialogueChainData, index: Map<string, ChainNode>): ChainProblem[] {
  const problems: ChainProblem[] = []
  const start = index.get(chain.startId)
  if (!start) return problems

  const reached = new Set<string>()
  const inProgress = new Set<string>()
  const endings: string[] = []
  const cycles = new Set<string>()

  const visit = (node: ChainNode): void => {
    if (inProgress.has(node.id)) {
      cycles.add(node.id)
      return
    }
    if (reached.has(node.id)) return
    reached.add(node.id)
    inProgress.add(node.id)
    if (node.ending) endings.push(node.id)
    for (const option of node.options) {
      const next = index.get(option.next)
      if (next) visit(next)
    }
    inProgress.delete(node.id)
  }

  visit(start)

  for (const nodeId of cycles) {
    problems.push({
      kind: 'cycle',
      nodeId,
      message: `Разговор зацикливается: в узел «${nodeId}» можно вернуться из него самого.`,
    })
  }

  for (const node of index.values()) {
    if (!reached.has(node.id)) {
      problems.push({
        kind: 'unreachable',
        nodeId: node.id,
        message: `В узел «${node.id}» невозможно попасть от начала разговора.`,
      })
    }
  }

  if (endings.length === 0) {
    problems.push({
      kind: 'no-endings',
      message: `В цепочке «${chain.id}» нет ни одной достижимой концовки.`,
    })
  }

  return problems
}

export function assertValidChain(chain: DialogueChainData, options: ValidateOptions = {}): void {
  const problems = validateChain(chain, options)
  if (problems.length === 0) return
  throw new Error(
    `Цепочка «${chain.id}» собрана неверно:\n${problems.map((p) => `— ${p.message}`).join('\n')}`,
  )
}

/** Сохраняемое состояние разговора. */
export interface ConversationState {
  chainId: string
  /** Где мы сейчас. Пусто — разговор ещё не начат. */
  nodeId: string | null
  /** Что уже выбрали, по порядку. */
  chosen: string[]
  /** Накопленные эффекты. */
  totals: EffectTotals
  finished: boolean
  endingId?: string
}

export interface ConversationOutcome {
  chainId: string
  ending: ChainEnding
  /** Последняя реплика собеседника. */
  finalLine: string
  totals: EffectTotals
  /** Идентификаторы выбранных реплик по порядку. */
  path: string[]
  /** Итог человеческим языком. */
  report: OutcomeReport
}

export interface ChainStep {
  /** Что ответил собеседник. */
  reply: string
  /** Что произошло между вами — словами, а не числами. */
  consequence: ConsequenceReport
  /** Следующий узел — если разговор продолжается. */
  node?: ChainNode
  /** Итог — если разговор кончился. */
  outcome?: ConversationOutcome
}

export interface ConversationOptions {
  /** Человеческие названия навыков для описания последствий. */
  skillLabels?: SkillLabels
}

/**
 * Разговор: помнит, где мы, что выбрали и что накопили.
 *
 * Порядок работы: start() → currentOptions() → choose() → и так далее,
 * пока choose() не вернёт outcome вместо следующего узла.
 */
export class Conversation {
  private readonly chain: DialogueChainData
  private readonly index: Map<string, ChainNode>
  private readonly context: DialogueContext
  private readonly skillLabels: SkillLabels

  private nodeId: string | null = null
  private chosen: string[] = []
  private totals: EffectTotals = emptyTotals()
  private visited = new Set<string>()
  private result: ConversationOutcome | null = null

  constructor(
    chain: DialogueChainData,
    context: DialogueContext,
    options: ConversationOptions = {},
  ) {
    assertValidChain(chain)
    this.chain = chain
    this.context = context
    this.skillLabels = options.skillLabels ?? {}
    this.index = new Map(chain.nodes.map((node) => [node.id, node]))
  }

  get chainId(): string {
    return this.chain.id
  }

  get speakerId(): string {
    return this.chain.speakerId
  }

  /** Обстановка и завязка — показывается один раз, до первой реплики. */
  get intro(): string | undefined {
    return this.chain.intro
  }

  get started(): boolean {
    return this.nodeId !== null
  }

  get finished(): boolean {
    return this.result !== null
  }

  /** Начинает разговор и отдаёт первый узел. */
  start(): ChainNode {
    if (this.started) throw new Error(`Разговор «${this.chain.id}» уже начат.`)
    const node = this.index.get(this.chain.startId)
    if (!node) throw new Error(`Стартовый узел «${this.chain.startId}» не найден.`)
    this.nodeId = node.id
    this.visited.add(node.id)
    return node
  }

  currentNode(): ChainNode {
    if (this.result) throw new Error(`Разговор «${this.chain.id}» уже закончен.`)
    if (this.nodeId === null) throw new Error(`Разговор «${this.chain.id}» ещё не начат.`)
    const node = this.index.get(this.nodeId)
    if (!node) throw new Error(`Узел «${this.nodeId}» пропал из цепочки.`)
    return node
  }

  /** Реплики, доступные игроку прямо сейчас. */
  currentOptions(): ChainOption[] {
    return availableChainOptions(this.currentNode(), this.context)
  }

  /** Выбирает ответ и отдаёт реакцию собеседника. */
  choose(optionId: string): ChainStep {
    const node = this.currentNode()
    const option = node.options.find((item) => item.id === optionId)
    if (!option) throw new Error(`В узле «${node.id}» нет реплики «${optionId}».`)
    if (option.requires && !isAvailable(option.requires, this.context)) {
      throw new Error(`Реплика «${optionId}» сейчас недоступна: не выполнены её условия.`)
    }

    const next = this.index.get(option.next)
    if (!next) throw new Error(`Реплика «${optionId}» ведёт в несуществующий узел «${option.next}».`)
    if (this.visited.has(next.id)) {
      throw new Error(`Разговор зациклился: узел «${next.id}» уже был пройден.`)
    }

    this.totals = addChanges(this.totals, option.effects)
    this.chosen.push(option.id)
    this.visited.add(next.id)
    this.nodeId = next.id

    const consequence = describeChoice(option.consequence, option.effects, this.skillLabels)

    if (!next.ending) {
      return { reply: option.reply, consequence, node: next }
    }

    this.result = {
      chainId: this.chain.id,
      ending: next.ending,
      finalLine: next.prompt,
      totals: this.totals,
      path: [...this.chosen],
      report: describeConversation(
        { title: next.ending.title, summary: next.ending.summary, totals: this.totals },
        this.skillLabels,
      ),
    }
    return { reply: option.reply, consequence, outcome: this.result }
  }

  outcome(): ConversationOutcome | undefined {
    return this.result ?? undefined
  }

  state(): ConversationState {
    const state: ConversationState = {
      chainId: this.chain.id,
      nodeId: this.nodeId,
      chosen: [...this.chosen],
      totals: this.totals,
      finished: this.finished,
    }
    if (this.result) state.endingId = this.result.ending.id
    return state
  }
}

/** Все концовки цепочки — для тестов, отладки и справки по сцене. */
export function chainEndings(chain: DialogueChainData): ChainEnding[] {
  return chain.nodes.flatMap((node) => (node.ending ? [node.ending] : []))
}
