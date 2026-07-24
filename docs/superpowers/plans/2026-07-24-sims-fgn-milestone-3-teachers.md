# Симс ФГН — Этап 3: Преподаватели и диалоги

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать игре душу: шесть преподавателей с характерами, отношения по двум измерениям, шкала философских традиций и узловые диалоги, где выбор реплики зависит от того, что ты прочитал и на чьей ты стороне.

**Architecture:** Новый модуль `src/sim/social/` (отношения, фракция, преподаватели) и `src/sim/dialogue/` (узлы, условия, эффекты). Реплики — данные в `src/content/`, взятые из исследований, а не выдуманные. `World` получает поле `social: SocialState`.

**Tech Stack:** тот же. Ни одной новой зависимости.

## Global Constraints

- Всё из этапов 1–2 в силе: `src/sim/` не импортирует `react`, `three`, `@react-three/*`, `zustand`, `src/content/`.
- Отношения — два независимых измерения, каждое от −100 до 100.
- Шкала философских традиций: −100 аналитическая … +100 континентальная.
- **Реплики преподавателей берутся из отчётов исследования** (`research/faculty.md`, `research/alieva.md`, `research/marey-deep.md`). Выдуманное помечается в комментарии как художественное допущение.
- Весь текст на русском, коммиты на русском.

---

### Task 1: Отношения

**Files:**
- Create: `src/sim/social/Relationship.ts`
- Test: `src/sim/social/Relationship.test.ts`

**Interfaces:**
- Produces:
  - `interface Relationship { affection: number; respect: number }`
  - `type RelationshipLevel = 'hostile' | 'stranger' | 'acquaintance' | 'friendly' | 'close'`
  - `class RelationshipMap` — методы `get`, `adjust`, `set`, `levelOf`, `describeFor`, `toJSON`, `static fromJSON`
  - `function relationshipLevel(relationship: Relationship): RelationshipLevel`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/social/Relationship.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RelationshipMap, relationshipLevel } from './Relationship'

describe('уровень отношений', () => {
  it('незнакомец по умолчанию', () => {
    expect(relationshipLevel({ affection: 0, respect: 0 })).toBe('stranger')
  })

  it('враждебность при заметном минусе', () => {
    expect(relationshipLevel({ affection: -60, respect: -40 })).toBe('hostile')
  })

  it('уважение без симпатии — это знакомство, а не дружба', () => {
    expect(relationshipLevel({ affection: 5, respect: 80 })).toBe('acquaintance')
  })

  it('симпатия делает отношения дружескими', () => {
    expect(relationshipLevel({ affection: 45, respect: 20 })).toBe('friendly')
  })

  it('близкие отношения требуют и симпатии, и уважения', () => {
    expect(relationshipLevel({ affection: 75, respect: 70 })).toBe('close')
    expect(relationshipLevel({ affection: 75, respect: 10 })).not.toBe('close')
  })
})

describe('RelationshipMap', () => {
  it('незнакомые начинаются с нуля', () => {
    expect(new RelationshipMap().get('marey')).toEqual({ affection: 0, respect: 0 })
  })

  it('изменяет отношения дельтой', () => {
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 12 })
    map.adjust('marey', { respect: 8, affection: -5 })
    expect(map.get('marey')).toEqual({ affection: -5, respect: 20 })
  })

  it('зажимает в диапазон от -100 до 100', () => {
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 500 })
    expect(map.get('marey').respect).toBe(100)
    map.adjust('marey', { respect: -500 })
    expect(map.get('marey').respect).toBe(-100)
  })

  it('не путает разных людей', () => {
    const map = new RelationshipMap()
    map.adjust('marey', { respect: 30 })
    expect(map.get('alieva')).toEqual({ affection: 0, respect: 0 })
  })

  it('описывает отношения по-русски', () => {
    const map = new RelationshipMap()
    expect(map.describeFor('marey')).toBe('Незнакомы')
    map.adjust('marey', { affection: 80, respect: 70 })
    expect(map.describeFor('marey')).toBe('Близкие отношения')
  })

  it('переживает сохранение и загрузку', () => {
    const map = new RelationshipMap()
    map.adjust('alieva', { respect: 40 })
    const restored = RelationshipMap.fromJSON(JSON.parse(JSON.stringify(map.toJSON())))
    expect(restored.get('alieva').respect).toBe(40)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Relationship`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

Создать `src/sim/social/Relationship.ts`:

```ts
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
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Relationship`
Expected: PASS, 11 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/social
git commit -m "feat: отношения по двум измерениям — симпатия и уважение"
```

---

### Task 2: Философские традиции

**Files:**
- Create: `src/sim/social/Faction.ts`
- Test: `src/sim/social/Faction.test.ts`

**Interfaces:**
- Produces:
  - `const ANALYTIC = -100`, `const CONTINENTAL = 100`
  - `function clampFaction(value: number): number`
  - `function factionLabel(value: number): string`
  - `function affinity(position: number, tolerance: number, playerValue: number): number` — от −1 (чужой) до 1 (свой)
  - `function affinityBonus(affinity: number): number` — множитель к приросту уважения

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/social/Faction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { affinity, affinityBonus, clampFaction, factionLabel } from './Faction'

describe('шкала традиций', () => {
  it('зажимает значение', () => {
    expect(clampFaction(-500)).toBe(-100)
    expect(clampFaction(500)).toBe(100)
    expect(clampFaction(30)).toBe(30)
  })

  it('подписывает позицию по-русски', () => {
    expect(factionLabel(-90)).toContain('налит')
    expect(factionLabel(90)).toContain('онтинент')
    expect(factionLabel(0)).toContain('е определил')
  })
})

describe('близость к преподавателю', () => {
  it('полное совпадение даёт единицу', () => {
    expect(affinity(60, 40, 60)).toBeCloseTo(1, 5)
  })

  it('на границе допуска близость нулевая', () => {
    expect(affinity(60, 40, 20)).toBeCloseTo(0, 5)
    expect(affinity(60, 40, 100)).toBeCloseTo(0, 5)
  })

  it('за пределами допуска близость отрицательная', () => {
    expect(affinity(60, 40, -100)).toBeLessThan(0)
  })

  it('никогда не опускается ниже минус единицы', () => {
    expect(affinity(100, 10, -100)).toBeGreaterThanOrEqual(-1)
  })

  it('широкий допуск прощает расхождение', () => {
    const tolerant = affinity(0, 100, 60)
    const strict = affinity(0, 20, 60)
    expect(tolerant).toBeGreaterThan(strict)
  })

  it('множитель к уважению растёт вместе с близостью', () => {
    expect(affinityBonus(1)).toBeGreaterThan(affinityBonus(0))
    expect(affinityBonus(0)).toBeGreaterThan(affinityBonus(-1))
    expect(affinityBonus(-1)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Faction`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать**

Создать `src/sim/social/Faction.ts`:

```ts
/** Крайние точки шкалы философских традиций. */
export const ANALYTIC = -100
export const CONTINENTAL = 100

export function clampFaction(value: number): number {
  return Math.min(CONTINENTAL, Math.max(ANALYTIC, value))
}

export function factionLabel(value: number): string {
  if (value <= -70) return 'Убеждённый аналитик'
  if (value <= -30) return 'Скорее аналитик'
  if (value < 30) return 'Ещё не определился'
  if (value < 70) return 'Скорее континентальный'
  return 'Континентальный до мозга костей'
}

/**
 * Насколько студент «свой» для преподавателя.
 * 1 — попал точно в позицию, 0 — на границе допуска, отрицательное — чужой.
 *
 * Именно поэтому всеобщим любимцем стать нельзя: приблизившись к одному
 * полюсу, неизбежно отдаляешься от другого.
 */
export function affinity(position: number, tolerance: number, playerValue: number): number {
  const safeTolerance = Math.max(1, tolerance)
  const distance = Math.abs(position - playerValue)
  return Math.max(-1, 1 - distance / safeTolerance)
}

/**
 * Множитель к приросту уважения.
 * Даже полный чужак может заслужить уважение — просто вчетверо медленнее.
 */
export function affinityBonus(affinityValue: number): number {
  return 0.25 + (affinityValue + 1) * 0.625
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Faction`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/social/Faction.ts src/sim/social/Faction.test.ts
git commit -m "feat: шкала философских традиций и близость к преподавателю"
```

---

### Task 3: Модель преподавателя и диалоговые узлы

**Files:**
- Create: `src/sim/social/Teacher.ts`
- Create: `src/sim/dialogue/Dialogue.ts`
- Test: `src/sim/dialogue/Dialogue.test.ts`

**Interfaces:**
- Produces:
  - `interface Teacher { id, name, short, patronymic, courseIds, factionPosition, factionTolerance, lines }`
  - `interface TeacherLines { greeting, praise, rebuke, lateArrival, examPass, examFail }`
  - `type TeacherCatalog = Record<string, Teacher>`
  - `interface DialogueContext { skills, faction, relationship, readBooks, day }`
  - `interface DialogueRequirement { skillId?, skillMin?, factionMin?, factionMax?, respectMin?, affectionMin?, book? }`
  - `interface DialogueOption { id, text, requires?, effects, reply }`
  - `interface DialogueEffects { respect?, affection?, faction?, skill?, grade? }`
  - `interface DialogueNode { id, speakerId, prompt, options }`
  - `function isAvailable(requirement, context): boolean`
  - `function availableOptions(node, context): DialogueOption[]`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/dialogue/Dialogue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { availableOptions, isAvailable, type DialogueContext, type DialogueNode } from './Dialogue'

const CONTEXT: DialogueContext = {
  skills: { greek: 6, logic: 2, german: 0, writing: 4, rhetoric: 5, stamina: 3 },
  faction: 40,
  relationship: { affection: 10, respect: 30 },
  readBooks: ['phaedo'],
  day: 12,
}

describe('условия доступности реплики', () => {
  it('пустое условие доступно всегда', () => {
    expect(isAvailable({}, CONTEXT)).toBe(true)
  })

  it('требование навыка', () => {
    expect(isAvailable({ skillId: 'greek', skillMin: 5 }, CONTEXT)).toBe(true)
    expect(isAvailable({ skillId: 'greek', skillMin: 8 }, CONTEXT)).toBe(false)
    expect(isAvailable({ skillId: 'logic', skillMin: 5 }, CONTEXT)).toBe(false)
  })

  it('неизвестный навык считается нулевым', () => {
    expect(isAvailable({ skillId: 'латынь', skillMin: 1 }, CONTEXT)).toBe(false)
  })

  it('требование позиции на шкале традиций', () => {
    expect(isAvailable({ factionMin: 20 }, CONTEXT)).toBe(true)
    expect(isAvailable({ factionMin: 60 }, CONTEXT)).toBe(false)
    expect(isAvailable({ factionMax: 50 }, CONTEXT)).toBe(true)
    expect(isAvailable({ factionMax: 10 }, CONTEXT)).toBe(false)
  })

  it('требование отношений', () => {
    expect(isAvailable({ respectMin: 25 }, CONTEXT)).toBe(true)
    expect(isAvailable({ respectMin: 50 }, CONTEXT)).toBe(false)
    expect(isAvailable({ affectionMin: 5 }, CONTEXT)).toBe(true)
    expect(isAvailable({ affectionMin: 50 }, CONTEXT)).toBe(false)
  })

  it('требование прочитанной книги', () => {
    expect(isAvailable({ book: 'phaedo' }, CONTEXT)).toBe(true)
    expect(isAvailable({ book: 'critique' }, CONTEXT)).toBe(false)
  })

  it('несколько требований складываются по И', () => {
    expect(isAvailable({ book: 'phaedo', respectMin: 25 }, CONTEXT)).toBe(true)
    expect(isAvailable({ book: 'phaedo', respectMin: 90 }, CONTEXT)).toBe(false)
  })
})

const NODE: DialogueNode = {
  id: 'test',
  speakerId: 'marey',
  prompt: 'И что же вы думаете об этом тексте?',
  options: [
    { id: 'safe', text: 'Промолчать', effects: {}, reply: 'Понятно.' },
    {
      id: 'greek',
      text: 'Сослаться на греческий оригинал',
      requires: { skillId: 'greek', skillMin: 5 },
      effects: { respect: 8 },
      reply: 'Уже лучше.',
    },
    {
      id: 'locked',
      text: 'Возразить по существу',
      requires: { respectMin: 90 },
      effects: { respect: 15 },
      reply: 'Смело.',
    },
  ],
}

describe('доступные реплики', () => {
  it('отдаёт только те, чьи условия выполнены', () => {
    expect(availableOptions(NODE, CONTEXT).map((o) => o.id)).toEqual(['safe', 'greek'])
  })

  it('реплика без условий доступна всегда', () => {
    const poor: DialogueContext = {
      ...CONTEXT,
      skills: {},
      relationship: { affection: -50, respect: -50 },
      readBooks: [],
    }
    expect(availableOptions(NODE, poor).map((o) => o.id)).toEqual(['safe'])
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Dialogue`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать модель преподавателя**

Создать `src/sim/social/Teacher.ts`:

```ts
/** Наборы реплик преподавателя на типовые ситуации. */
export interface TeacherLines {
  greeting: string[]
  praise: string[]
  rebuke: string[]
  lateArrival: string[]
  examPass: string[]
  examFail: string[]
}

export interface Teacher {
  id: string
  /** Фамилия для расписания и плашек. */
  short: string
  /** Полное имя с отчеством, как к нему обращаются. */
  name: string
  courseIds: string[]
  /** Позиция на шкале философских традиций, −100..100. */
  factionPosition: number
  /** Насколько широко он терпит расхождение. Чем меньше, тем жёстче. */
  factionTolerance: number
  lines: TeacherLines
}

export type TeacherCatalog = Record<string, Teacher>
```

- [ ] **Step 4: Реализовать диалоги**

Создать `src/sim/dialogue/Dialogue.ts`:

```ts
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
```

- [ ] **Step 5: Запустить тесты**

Run: `npm test -- Dialogue`
Expected: PASS, 9 тестов.

- [ ] **Step 6: Коммит**

```bash
git add src/sim/social/Teacher.ts src/sim/dialogue
git commit -m "feat: модель преподавателя и узловые диалоги с условиями"
```

---

### Task 4: Шесть преподавателей

**Files:**
- Create: `src/content/people/teachers.ts`
- Test: `src/content/people/teachers.test.ts`

**Interfaces:**
- Produces: `const TEACHERS: TeacherCatalog`

**Источник реплик — обязательно к прочтению перед работой:**
- `research/faculty.md` — Михайловский, Павлов, Долгоруков, Кречетова
- `research/alieva.md` — Алиева: манифест, три речевых регистра, отзывы студентов
- `research/marey-deep.md` — Марей: дословные цитаты, речевой портрет

Реплики, взятые дословно, помечаются комментарием с источником. Выдуманные — комментарием «допущение».

- [ ] **Step 1: Написать падающие тесты**

Создать `src/content/people/teachers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { COURSES } from '../study/courses'
import { TEACHERS } from './teachers'

describe('преподаватели', () => {
  it('в игре шестеро', () => {
    expect(Object.keys(TEACHERS).length).toBe(6)
  })

  it('идентификатор совпадает с ключом каталога', () => {
    for (const [key, teacher] of Object.entries(TEACHERS)) {
      expect(teacher.id).toBe(key)
    }
  })

  it('все шестеро на месте', () => {
    for (const id of ['mikhailovsky', 'marey', 'pavlov', 'dolgorukov', 'alieva', 'krechetova']) {
      expect(TEACHERS[id], id).toBeDefined()
    }
  })

  it('у каждого есть имя с отчеством', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(teacher.name.split(' ').length, teacher.id).toBeGreaterThanOrEqual(3)
    }
  })

  it('позиция на шкале традиций в допустимых пределах', () => {
    for (const teacher of Object.values(TEACHERS)) {
      expect(teacher.factionPosition, teacher.id).toBeGreaterThanOrEqual(-100)
      expect(teacher.factionPosition, teacher.id).toBeLessThanOrEqual(100)
      expect(teacher.factionTolerance, teacher.id).toBeGreaterThan(0)
    }
  })

  it('преподаватели занимают разные позиции — иначе шкала бессмысленна', () => {
    const positions = Object.values(TEACHERS).map((t) => t.factionPosition)
    expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(80)
  })

  it('каждый курс с преподавателем-персонажем закреплён за ним', () => {
    for (const course of Object.values(COURSES)) {
      const teacher = TEACHERS[course.teacherId]
      expect(teacher, `курс ${course.id} ссылается на ${course.teacherId}`).toBeDefined()
      expect(teacher!.courseIds, teacher!.id).toContain(course.id)
    }
  })

  it('у каждого заполнены все наборы реплик', () => {
    for (const teacher of Object.values(TEACHERS)) {
      const { greeting, praise, rebuke, lateArrival, examPass, examFail } = teacher.lines
      for (const [name, lines] of Object.entries({
        greeting,
        praise,
        rebuke,
        lateArrival,
        examPass,
        examFail,
      })) {
        expect(lines.length, `${teacher.id}.${name}`).toBeGreaterThan(0)
        for (const line of lines) {
          expect(line.trim().length, `${teacher.id}.${name}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('реплики не повторяются дословно у разных преподавателей', () => {
    const seen = new Map<string, string>()
    for (const teacher of Object.values(TEACHERS)) {
      for (const line of Object.values(teacher.lines).flat()) {
        const owner = seen.get(line)
        expect(owner, `«${line}» есть и у ${owner}, и у ${teacher.id}`).toBeUndefined()
        seen.set(line, teacher.id)
      }
    }
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- teachers`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать преподавателей**

Создать `src/content/people/teachers.ts`. Ниже — обязательный каркас с уже подобранными репликами. Позиции на шкале традиций выведены из академических профилей.

Каждому нужно **не меньше двух реплик в каждом наборе**. Часть приведена ниже дословно из исследований; недостающие дописать в том же голосе, опираясь на речевой портрет из отчётов, и пометить комментарием «допущение».

```ts
import type { TeacherCatalog } from '../../sim/social/Teacher'

/**
 * Шесть преподавателей первого курса.
 *
 * Реплики, помеченные [источник], взяты дословно из публичных текстов
 * и официальных материалов ВШЭ, см. research/. Помеченные [допущение]
 * написаны в том же голосе, но не являются цитатами.
 *
 * Позиции на шкале традиций: −100 аналитическая, +100 континентальная.
 */
export const TEACHERS: TeacherCatalog = {
  mikhailovsky: {
    id: 'mikhailovsky',
    short: 'Михайловский',
    name: 'Михайловский Александр Владиславович',
    courseIds: ['histphil'],
    factionPosition: 85,
    factionTolerance: 45,
    lines: {
      greeting: [
        'Начнём. Текст перед вами — надеюсь, не только перед вами, но и прочитанный. [допущение]',
        'Сегодня медленно. Иначе не бывает. [допущение]',
      ],
      praise: [
        'Вот. Вы услышали, что говорит текст, а не что вам о нём рассказали. [допущение]',
        'Именно так. Держитесь этого места, оно важное. [допущение]',
      ],
      rebuke: [
        'Это пересказ комментария. А что говорит сам текст? [допущение]',
        'Вы прочли? Не пересказ, а текст. [допущение]',
      ],
      lateArrival: ['Проходите. Мы на втором абзаце. [допущение]'],
      examPass: ['Хорошо. Вы читали. Это видно. [допущение]'],
      examFail: ['Нет. Возвращайтесь к тексту, а не к конспекту. [допущение]'],
    },
  },

  marey: {
    id: 'marey',
    short: 'Марей',
    name: 'Марей Александр Владимирович',
    courseIds: ['nis'],
    factionPosition: 45,
    factionTolerance: 40,
    lines: {
      greeting: [
        'Итак, начнём. У нас с вами полтора часа и один текст. [допущение]',
        'Садитесь. Кто читал — тому сегодня будет интереснее. [допущение]',
      ],
      praise: [
        'Имя под переводом, если что, будет Ваше — у меня своей славы хватает. [research/marey-deep.md, telegram]',
        'Вот это уже аргумент, а не эрудиция. Разница принципиальная. [допущение]',
      ],
      rebuke: [
        // Его фирменная манера: подчёркнутая вежливость с ледяным дном.
        'Возникает, как минимум, лёгкое недоумение. Как самый минимум. [research/marey-deep.md, telegram]',
        'Овладение языком дисциплины — это условие входа в неё. Вы, кажется, ещё в дверях. [research/marey-deep.md + допущение]',
      ],
      lateArrival: [
        'Мы вас ждали. Не то чтобы долго, но ждали. [допущение]',
      ],
      examPass: [
        'Принято. Работайте дальше — теперь есть с чем. [допущение]',
      ],
      examFail: [
        'Помните, что это вам нужно. Нам это как раз не нужно, нам и без этого хорошо. [research/marey-deep.md, telegram]',
      ],
    },
  },

  alieva: {
    id: 'alieva',
    short: 'Алиева',
    name: 'Алиева Ольга Валерьевна',
    courseIds: ['greek'],
    factionPosition: -10,
    factionTolerance: 90,
    lines: {
      greeting: [
        'Дорогие друзья, продолжаем. Строчка за строчкой. [research/alieva.md]',
        'Πᾶσι καὶ πάσαις! Открываем на том же месте. [research/alieva.md, telegram]',
      ],
      praise: [
        'Прекрасно. Вы увидели аорист там, где его никто не ждал. [допущение]',
        'Да, именно так. С пожеланиями гуманистических успехов. [research/alieva.md]',
      ],
      rebuke: [
        'Это не тот падеж. Посмотрите ещё раз, там всё написано. [допущение]',
        'Не угадывайте. Разбирайте. [допущение]',
      ],
      lateArrival: ['Заходите, мы только начали разбирать первое предложение. [допущение]'],
      examPass: ['Хорошо. Теперь вы можете читать сами — а это и была цель. [допущение]'],
      examFail: ['Пока нет. Грамматика — это входной билет, а не преграда. Возвращайтесь. [допущение]'],
    },
  },

  dolgorukov: {
    id: 'dolgorukov',
    short: 'Долгоруков',
    name: 'Долгоруков Виталий Владимирович',
    courseIds: ['logic'],
    factionPosition: -85,
    factionTolerance: 50,
    lines: {
      greeting: [
        'Доска свободна. Начнём с задачи, которую вы не сделали дома. [допущение]',
        'Сегодня формальная семантика. Не бойтесь, там всё честно. [допущение]',
      ],
      praise: [
        'Верно. И, что важнее, доказуемо верно. [допущение]',
        'Хорошее решение. Короче моего. [допущение]',
      ],
      rebuke: [
        'Это интуиция, а не вывод. Интуиция иногда права, но проверить её нельзя. [допущение]',
        'Здесь у вас пропущен шаг. Один, но принципиальный. [допущение]',
      ],
      lateArrival: ['Проходите. Задача на доске, включайтесь. [допущение]'],
      examPass: ['Решено. Тут либо решено, либо нет — вам повезло с первым. [допущение]'],
      examFail: ['Не решено. Логика тем и хороша, что не обижается. Приходите ещё. [допущение]'],
    },
  },

  krechetova: {
    id: 'krechetova',
    short: 'Кречетова',
    name: 'Кречетова Мария Юрьевна',
    courseIds: ['ontology'],
    factionPosition: 60,
    factionTolerance: 70,
    lines: {
      greeting: [
        'Давайте сегодня попробуем разобраться, что здесь вообще спрашивается. [допущение]',
        'Начнём с трудного места. С лёгких всё равно никто не спорит. [допущение]',
      ],
      praise: [
        'Да, вы нащупали проблему. Теперь её надо сформулировать. [допущение]',
        'Хорошая мысль. Доведите её до конца, она того стоит. [допущение]',
      ],
      rebuke: [
        'Это слишком быстро. Здесь нельзя быстро. [допущение]',
        'Вы ответили на другой вопрос. Он тоже хороший, но другой. [допущение]',
      ],
      lateArrival: ['Ничего страшного, садитесь. Мы ещё формулируем вопрос. [допущение]'],
      examPass: ['Достойно. Вы прошли через текст, а не мимо. [допущение]'],
      examFail: ['Не получилось. Но вы уже понимаете, где именно — это половина дела. [допущение]'],
    },
  },

  pavlov: {
    id: 'pavlov',
    short: 'Павлов',
    name: 'Павлов Александр Владимирович',
    // На первом курсе не преподаёт: ходят на его открытые лекции.
    // См. дизайн-документ, раздел 7.2.
    courseIds: [],
    factionPosition: 30,
    factionTolerance: 100,
    lines: {
      greeting: [
        'Все расселись? Отлично. Сегодня будем считать философией то, что ею обычно не считают. [допущение]',
        'Кто не смотрел — не страшно. Хуже, если смотрели и ничего не заметили. [допущение]',
      ],
      praise: [
        'Отличное наблюдение. И, кстати, об этом есть целая статья. [допущение]',
        'Вот именно. Массовая культура не глупее нас, она просто честнее. [допущение]',
      ],
      rebuke: [
        'Это снобизм, а не аргумент. Снобизм тоже позиция, но менее интересная. [допущение]',
        'Вы описали сюжет. А что с ним не так — вот вопрос. [допущение]',
      ],
      lateArrival: ['Заходите, тут мест хватает. Обычно не хватает. [допущение]'],
      examPass: ['Зачтено. И посмотрите всё-таки то, что я советовал. [допущение]'],
      examFail: ['Не зачтено. Обидно: материал-то интересный. [допущение]'],
    },
  },
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- teachers`
Expected: PASS, 9 тестов.

Если тест на разброс позиций падает — значит преподаватели слишком похожи, и шкала традиций не работает как механика. Разводить позиции, а не ослаблять тест.

- [ ] **Step 5: Прогнать всё**

Run: `npm test && npm run build`
Expected: всё зелёное.

- [ ] **Step 6: Коммит**

```bash
git add src/content/people
git commit -m "feat: шесть преподавателей с репликами и позициями на шкале традиций"
```

---

## Что даёт этот этап

Отношения по двум измерениям, шкала философских традиций, где нельзя понравиться всем, узловые диалоги с условиями по навыкам, прочитанному и репутации — и шестеро преподавателей, говорящих каждый своим голосом, во многом дословно взятым из их публичных текстов.

## Следующие этапы

- **Этап 4 — жизнь вокруг:** остальные этажи, лифт и лестница как переходы, автономные NPC, однокурсники-архетипы из настоящих кружков ФГН.
- **Этап 5 — рамка:** общага и дорога, сессия и экзамены, эпилоги, сохранения, процедурный звук.
