/**
 * Отношения с персонажем по двум независимым измерениям.
 * Можно быть любимым и не уважаемым — и наоборот. С преподавателями
 * обычно качается уважение, с однокурсниками — симпатия.
 */
export interface Relationship {
  /** Насколько человек к тебе расположен, −100..100. */
  affection: number
  /** Насколько человек тебя ценит как студента, −100..100. */
  respect: number
}

export type RelationshipLevel = 'hostile' | 'stranger' | 'acquaintance' | 'friendly' | 'close'

const LEVEL_LABELS: Record<RelationshipLevel, string> = {
  hostile: 'Неприязнь',
  stranger: 'Незнакомы',
  acquaintance: 'Знакомы',
  friendly: 'Хорошие отношения',
  close: 'Близкие отношения',
}

function clamp(value: number): number {
  return Math.min(100, Math.max(-100, value))
}

export function relationshipLevel(relationship: Relationship): RelationshipLevel {
  const { affection, respect } = relationship

  if (affection <= -40 || respect <= -40) return 'hostile'
  if (affection >= 60 && respect >= 60) return 'close'
  if (affection >= 35) return 'friendly'
  if (affection >= 15 || respect >= 15) return 'acquaintance'
  return 'stranger'
}

export function createRelationship(): Relationship {
  return { affection: 0, respect: 0 }
}

export class RelationshipMap {
  private entries: Record<string, Relationship> = {}

  get(npcId: string): Relationship {
    return this.entries[npcId] ?? createRelationship()
  }

  set(npcId: string, relationship: Relationship): void {
    this.entries[npcId] = {
      affection: clamp(relationship.affection),
      respect: clamp(relationship.respect),
    }
  }

  adjust(npcId: string, delta: Partial<Relationship>): void {
    const current = this.get(npcId)
    this.set(npcId, {
      affection: current.affection + (delta.affection ?? 0),
      respect: current.respect + (delta.respect ?? 0),
    })
  }

  levelOf(npcId: string): RelationshipLevel {
    return relationshipLevel(this.get(npcId))
  }

  describeFor(npcId: string): string {
    return LEVEL_LABELS[this.levelOf(npcId)]
  }

  toJSON(): Record<string, Relationship> {
    return JSON.parse(JSON.stringify(this.entries)) as Record<string, Relationship>
  }

  static fromJSON(entries: Record<string, Relationship>): RelationshipMap {
    const map = new RelationshipMap()
    map.entries = JSON.parse(JSON.stringify(entries)) as Record<string, Relationship>
    return map
  }
}
