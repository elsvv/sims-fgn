# Симс ФГН — Этап 1: Ходячий скелет

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить работающее ядро игры: по этажу здания, сгенерированному из данных, ходит процедурный персонаж под изометрической камерой, у него текут игровое время и нужды, и он умеет взаимодействовать с предметами.

**Architecture:** Три слоя с жёсткой границей. `src/sim/` — чистый TypeScript без React и без three.js, вся игровая логика, полностью тестируется в Node. `src/content/` — типизированные данные (планировки этажей, каталог предметов), зависит от `sim/`, но не наоборот. `src/render/` — React Three Fiber, только рисует и передаёт ввод в симуляцию. Игровой цикл живёт вне реконсиляции React: симуляция тикает в `useFrame` и мутирует своё состояние, React читает снимки по таймеру.

**Tech Stack:** TypeScript (strict), Vite, React 19, React Three Fiber + drei, three.js, Vitest.

## Global Constraints

- TypeScript в строгом режиме (`strict: true`), никаких `any` в новом коде.
- **Модуль `src/sim/` не имеет права импортировать `react`, `three`, `@react-three/*`, `zustand` или что-либо из `src/content/`.** Направление зависимостей: `render → content → sim`. Проверяется тестом в Задаче 1.
- Язык всего пользовательского текста — русский.
- Ни одного бинарного ассета: геометрия и звук порождаются кодом.
- Единицы: расстояния — метры, игровое время — минуты, нужды — 0..100.
- Плоскость мира — XZ (three.js, ось Y вверх). Тип `Vec2` имеет поля `x` и `z`, не `x` и `y`.
- Нужды: 100 = удовлетворена, 0 = критично. **Исключение — `stress`: 0 = спокоен, 100 = на грани.** В интерфейсе стресс показывается инвертированно, под подписью «Спокойствие».
- Коммит после каждой задачи, сообщения на русском в стиле `feat: ...`.

---

### Task 1: Скаффолд проекта и защита границы слоёв

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`
- Create: `src/main.tsx`, `src/render/App.tsx`, `src/sim/types.ts`
- Test: `src/sim/architecture.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - рабочая сборка Vite и команда `npm test` на Vitest
  - `interface Vec2 { x: number; z: number }`
  - `interface GridPos { col: number; row: number }`
  - `function vec2(x: number, z: number): Vec2`
  - `function distance(a: Vec2, b: Vec2): number`

- [ ] **Step 1: Создать `.gitignore`**

```
node_modules
dist
.DS_Store
*.local
research/refs
```

- [ ] **Step 2: Создать `package.json`**

```json
{
  "name": "sims-fgn",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Установить зависимости**

Ставим без пинов, чтобы получить актуальные совместимые версии; они зафиксируются в `package-lock.json`.

```bash
npm install react react-dom three @react-three/fiber @react-three/drei
npm install -D typescript vite @vitejs/plugin-react vitest @types/react @types/react-dom @types/three
```

Expected: `node_modules/` создан, в `package.json` появились `dependencies` и `devDependencies`, конфликтов версий нет.

- [ ] **Step 4: Создать `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 5: Создать `vite.config.ts`**

`defineConfig` импортируется из `vitest/config`, иначе поле `test` не пройдёт проверку типов.

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

- [ ] **Step 6: Создать `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Симс ФГН</title>
    <style>
      html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
      body { background: #14161b; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Создать `src/render/App.tsx`**

```tsx
export function App() {
  return <div style={{ color: '#e8e8ea', padding: 24 }}>Симс ФГН</div>
}
```

- [ ] **Step 8: Создать `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './render/App'

const container = document.getElementById('root')
if (!container) throw new Error('Не найден корневой элемент #root')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: Написать падающий тест границы слоёв**

Создать `src/sim/architecture.test.ts`. Первый тест намеренно проверяет, что в `src/sim/` вообще есть исходные файлы — без него проверка импортов давала бы зелёный результат на пустом каталоге.

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SIM_DIR = join(process.cwd(), 'src', 'sim')
const FORBIDDEN = ['react', 'three', '@react-three/fiber', '@react-three/drei', 'zustand']

function collectSourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      found.push(full)
    }
  }
  return found
}

describe('граница слоёв', () => {
  it('в src/sim есть исходные файлы', () => {
    expect(collectSourceFiles(SIM_DIR).length).toBeGreaterThan(0)
  })

  it('src/sim не зависит от рендера', () => {
    const violations: string[] = []
    for (const file of collectSourceFiles(SIM_DIR)) {
      const source = readFileSync(file, 'utf8')
      for (const pkg of FORBIDDEN) {
        const pattern = new RegExp(`from\\s+['"]${pkg.replace('/', '\\/')}(['"/])`)
        if (pattern.test(source)) violations.push(`${file} импортирует ${pkg}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('src/sim не зависит от src/content', () => {
    const violations: string[] = []
    for (const file of collectSourceFiles(SIM_DIR)) {
      const source = readFileSync(file, 'utf8')
      if (/from\s+['"][^'"]*\/content\//.test(source)) {
        violations.push(`${file} импортирует данные из content`)
      }
    }
    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 10: Запустить тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — тест «в src/sim есть исходные файлы» падает: в `src/sim/` нет ни одного не-тестового `.ts`.

- [ ] **Step 11: Создать `src/sim/types.ts`**

```ts
/** Точка на плоскости мира в метрах. Мир лежит в плоскости XZ, ось Y направлена вверх. */
export interface Vec2 {
  x: number
  z: number
}

/** Позиция в клетках навигационной сетки. */
export interface GridPos {
  col: number
  row: number
}

export function vec2(x: number, z: number): Vec2 {
  return { x, z }
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}
```

- [ ] **Step 12: Запустить тесты**

Run: `npm test`
Expected: PASS, 3 теста.

- [ ] **Step 13: Проверить сборку**

Run: `npm run build`
Expected: успешно, создан `dist/`.

- [ ] **Step 14: Коммит**

```bash
git add -A
git commit -m "feat: скаффолд проекта и тест границы слоёв"
```

---

### Task 2: Игровое время

**Files:**
- Create: `src/sim/time/GameClock.ts`
- Test: `src/sim/time/GameClock.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `type Speed = 0 | 1 | 2 | 3`
  - `interface GameTime { day: number; minutes: number }`
  - `class GameClock` — поле `speed: Speed`, геттеры `time: GameTime` и `totalMinutes: number`, методы `advance(realDeltaSeconds: number): number`, `formatTime(): string`, `formatDay(): string`
  - `const GAME_MINUTES_PER_REAL_SECOND = 1.5`
  - `const MINUTES_PER_DAY = 1440`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/time/GameClock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { GameClock, GAME_MINUTES_PER_REAL_SECOND } from './GameClock'

describe('GameClock', () => {
  it('стартует в день 0 в 07:00', () => {
    expect(new GameClock().time).toEqual({ day: 0, minutes: 7 * 60 })
  })

  it('на паузе время не идёт', () => {
    const clock = new GameClock()
    clock.speed = 0
    expect(clock.advance(10)).toBe(0)
    expect(clock.time.minutes).toBe(7 * 60)
  })

  it('на скорости 1x за реальную секунду проходит GAME_MINUTES_PER_REAL_SECOND игровых минут', () => {
    const clock = new GameClock()
    clock.speed = 1
    expect(clock.advance(1)).toBeCloseTo(GAME_MINUTES_PER_REAL_SECOND, 5)
  })

  it('на скорости 3x время идёт втрое быстрее', () => {
    const clock = new GameClock()
    clock.speed = 3
    expect(clock.advance(1)).toBeCloseTo(GAME_MINUTES_PER_REAL_SECOND * 3, 5)
  })

  it('перекатывает сутки', () => {
    const clock = new GameClock(0, 23 * 60)
    clock.speed = 1
    clock.advance((2 * 60) / GAME_MINUTES_PER_REAL_SECOND)
    expect(clock.time.day).toBe(1)
    expect(clock.time.minutes).toBeCloseTo(60, 5)
  })

  it('форматирует время как ЧЧ:ММ', () => {
    expect(new GameClock(0, 7 * 60).formatTime()).toBe('07:00')
    expect(new GameClock(0, 9 * 60 + 5).formatTime()).toBe('09:05')
    expect(new GameClock(0, 23 * 60 + 59).formatTime()).toBe('23:59')
  })

  it('форматирует день как «Неделя N, день недели»', () => {
    expect(new GameClock(0, 0).formatDay()).toBe('Неделя 1, понедельник')
    expect(new GameClock(4, 0).formatDay()).toBe('Неделя 1, пятница')
    expect(new GameClock(7, 0).formatDay()).toBe('Неделя 2, понедельник')
  })

  it('totalMinutes растёт монотонно через границу суток', () => {
    const clock = new GameClock(0, 1439)
    const before = clock.totalMinutes
    clock.speed = 1
    clock.advance(10)
    expect(clock.totalMinutes).toBeGreaterThan(before)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- GameClock`
Expected: FAIL — `Failed to resolve import "./GameClock"`.

- [ ] **Step 3: Реализовать `GameClock`**

Создать `src/sim/time/GameClock.ts`:

```ts
/** Множитель скорости игры. 0 — пауза. */
export type Speed = 0 | 1 | 2 | 3

export interface GameTime {
  /** Номер игрового дня с начала модуля, начиная с 0. */
  day: number
  /** Минут с полуночи, 0..1439. */
  minutes: number
}

/** Сколько игровых минут проходит за одну реальную секунду на скорости 1x. */
export const GAME_MINUTES_PER_REAL_SECOND = 1.5

export const MINUTES_PER_DAY = 1440

const WEEKDAYS = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const

export class GameClock {
  speed: Speed = 1

  /** Минут с начала модуля. Растёт монотонно. */
  private elapsed: number

  constructor(startDay = 0, startMinutes = 7 * 60) {
    this.elapsed = startDay * MINUTES_PER_DAY + startMinutes
  }

  get totalMinutes(): number {
    return this.elapsed
  }

  get time(): GameTime {
    return {
      day: Math.floor(this.elapsed / MINUTES_PER_DAY),
      minutes: this.elapsed % MINUTES_PER_DAY,
    }
  }

  /**
   * Продвигает часы. Возвращает, сколько игровых минут прошло,
   * чтобы вызывающий код мог начислить износ нужд.
   */
  advance(realDeltaSeconds: number): number {
    if (this.speed === 0) return 0
    const gameMinutes = realDeltaSeconds * GAME_MINUTES_PER_REAL_SECOND * this.speed
    this.elapsed += gameMinutes
    return gameMinutes
  }

  formatTime(): string {
    const { minutes } = this.time
    const hh = Math.floor(minutes / 60)
    const mm = Math.floor(minutes % 60)
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  formatDay(): string {
    const { day } = this.time
    const week = Math.floor(day / 7) + 1
    const weekday = WEEKDAYS[day % 7] ?? 'понедельник'
    return `Неделя ${week}, ${weekday}`
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- GameClock`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/time
git commit -m "feat: игровые часы с паузой, ускорением и форматированием"
```

---

### Task 3: Нужды

**Files:**
- Create: `src/sim/needs/needs.ts`
- Test: `src/sim/needs/needs.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `type NeedId = 'energy' | 'hunger' | 'bladder' | 'hygiene' | 'social' | 'fun' | 'stress'`
  - `type Needs = Record<NeedId, number>`
  - `const NEED_IDS: readonly NeedId[]`
  - `const NEED_LABELS: Record<NeedId, string>`
  - `function createNeeds(overrides?: Partial<Needs>): Needs`
  - `function decayNeeds(needs: Needs, gameMinutes: number): Needs`
  - `function applyNeedDelta(needs: Needs, delta: Partial<Needs>): Needs`
  - `function needSatisfaction(id: NeedId, value: number): number`
  - `function calculateMood(needs: Needs): number`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/needs/needs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyNeedDelta,
  calculateMood,
  createNeeds,
  decayNeeds,
  needSatisfaction,
  NEED_IDS,
  NEED_LABELS,
} from './needs'

describe('нужды', () => {
  it('создаются полными, стресс — нулевым', () => {
    const needs = createNeeds()
    expect(needs.energy).toBe(100)
    expect(needs.hunger).toBe(100)
    expect(needs.stress).toBe(0)
  })

  it('принимают переопределения при создании', () => {
    expect(createNeeds({ energy: 40 }).energy).toBe(40)
  })

  it('убывают со временем', () => {
    const before = createNeeds()
    const after = decayNeeds(before, 60)
    expect(after.energy).toBeLessThan(before.energy)
    expect(after.hunger).toBeLessThan(before.hunger)
  })

  it('не мутируют исходный объект', () => {
    const before = createNeeds()
    decayNeeds(before, 600)
    expect(before.energy).toBe(100)
  })

  it('стресс со временем растёт, а не убывает', () => {
    expect(decayNeeds(createNeeds(), 60).stress).toBeGreaterThan(0)
  })

  it('зажимаются в диапазон 0..100', () => {
    const drained = decayNeeds(createNeeds(), 100000)
    for (const id of NEED_IDS) {
      expect(drained[id]).toBeGreaterThanOrEqual(0)
      expect(drained[id]).toBeLessThanOrEqual(100)
    }
    expect(drained.energy).toBe(0)
    expect(drained.stress).toBe(100)
  })

  it('применяют дельту и зажимают результат', () => {
    const needs = createNeeds({ energy: 90 })
    expect(applyNeedDelta(needs, { energy: 30 }).energy).toBe(100)
    expect(applyNeedDelta(needs, { energy: -200 }).energy).toBe(0)
  })

  it('удовлетворённость стресса инвертирована', () => {
    expect(needSatisfaction('energy', 80)).toBe(80)
    expect(needSatisfaction('stress', 80)).toBe(20)
  })

  it('подпись стресса отражает инверсию', () => {
    expect(NEED_LABELS.stress).toBe('Спокойствие')
  })

  it('настроение высоко при полных нуждах и нулевом стрессе', () => {
    expect(calculateMood(createNeeds())).toBeGreaterThan(90)
  })

  it('настроение падает от голода и стресса', () => {
    expect(calculateMood(createNeeds({ hunger: 5, stress: 95, energy: 10 }))).toBeLessThan(40)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- needs`
Expected: FAIL — `Failed to resolve import "./needs"`.

- [ ] **Step 3: Реализовать нужды**

Создать `src/sim/needs/needs.ts`:

```ts
/**
 * Нужды персонажа. Для всех нужд, кроме stress, 100 = удовлетворена, 0 = критично.
 * Для stress ровно наоборот: 0 = спокоен, 100 = на грани.
 */
export type NeedId =
  | 'energy'
  | 'hunger'
  | 'bladder'
  | 'hygiene'
  | 'social'
  | 'fun'
  | 'stress'

export type Needs = Record<NeedId, number>

export const NEED_IDS: readonly NeedId[] = [
  'energy',
  'hunger',
  'bladder',
  'hygiene',
  'social',
  'fun',
  'stress',
]

/**
 * Подписи в интерфейсе. У стресса подпись «Спокойствие», потому что
 * полоска показывает удовлетворённость: полная полоска всегда означает,
 * что всё хорошо.
 */
export const NEED_LABELS: Record<NeedId, string> = {
  energy: 'Энергия',
  hunger: 'Сытость',
  bladder: 'Мочевой пузырь',
  hygiene: 'Гигиена',
  social: 'Социальность',
  fun: 'Веселье',
  stress: 'Спокойствие',
}

/**
 * На сколько единиц меняется нужда за игровой час сама по себе.
 * Подобрано так, чтобы за учебный день персонаж успел проголодаться
 * дважды и вымотаться к ночи.
 */
const DRIFT_PER_HOUR: Record<NeedId, number> = {
  energy: -6,
  hunger: -9,
  bladder: -12,
  hygiene: -4,
  social: -5,
  fun: -7,
  stress: +3,
}

const MOOD_WEIGHTS: Record<NeedId, number> = {
  energy: 1.4,
  hunger: 1.2,
  bladder: 0.8,
  hygiene: 0.6,
  social: 0.9,
  fun: 0.9,
  stress: 1.5,
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function createNeeds(overrides: Partial<Needs> = {}): Needs {
  return {
    energy: 100,
    hunger: 100,
    bladder: 100,
    hygiene: 100,
    social: 100,
    fun: 100,
    stress: 0,
    ...overrides,
  }
}

/** Возвращает новый объект нужд, состаренный на указанное число игровых минут. */
export function decayNeeds(needs: Needs, gameMinutes: number): Needs {
  const hours = gameMinutes / 60
  const next = {} as Needs
  for (const id of NEED_IDS) {
    next[id] = clamp(needs[id] + DRIFT_PER_HOUR[id] * hours)
  }
  return next
}

/** Возвращает новый объект нужд с применённой дельтой. */
export function applyNeedDelta(needs: Needs, delta: Partial<Needs>): Needs {
  const next = { ...needs }
  for (const id of NEED_IDS) {
    const change = delta[id]
    if (change !== undefined) next[id] = clamp(next[id] + change)
  }
  return next
}

/** Приводит нужду к шкале «насколько хорошо», где 100 всегда лучше 0. */
export function needSatisfaction(id: NeedId, value: number): number {
  return id === 'stress' ? 100 - value : value
}

/** Взвешенное настроение персонажа, 0..100. */
export function calculateMood(needs: Needs): number {
  let sum = 0
  let weightTotal = 0
  for (const id of NEED_IDS) {
    sum += needSatisfaction(id, needs[id]) * MOOD_WEIGHTS[id]
    weightTotal += MOOD_WEIGHTS[id]
  }
  return sum / weightTotal
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- needs`
Expected: PASS, 11 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/needs
git commit -m "feat: система нужд с износом, дельтами и расчётом настроения"
```

---

### Task 4: Определения предметов, планировка и навигационная сетка

**Files:**
- Create: `src/sim/world/PropDefinition.ts`
- Create: `src/sim/world/FloorPlan.ts`
- Create: `src/sim/world/NavGrid.ts`
- Test: `src/sim/world/NavGrid.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `GridPos`, `Needs`.
- Produces:
  - `interface Interaction { id: string; label: string; durationMinutes: number; needDelta: Partial<Needs> }`
  - `interface PropSize { w: number; d: number; h: number }`
  - `interface PropDefinition { kind, label, size, color, blocks, interactions }`
  - `type PropCatalog = Record<string, PropDefinition>`
  - `type TileKind = 'void' | 'floor' | 'wall' | 'door'`
  - `interface PropPlacement { id, kind, col, row, rotation, blocks? }`
  - `interface FloorPlan { id, name, cellSize, legend, tiles, props }`
  - `class NavGrid` — `cols`, `rows`, `cellSize`, методы `inBounds`, `tileAt`, `isWalkable`, `gridToWorld`, `worldToGrid`

Типы предметов живут в `sim/`, а не в `content/`, потому что симуляция обязана уметь рассуждать о предметах, не зная конкретных данных. Данные подставляются снаружи.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/world/NavGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from './FloorPlan'
import { NavGrid } from './NavGrid'

const PLAN: FloorPlan = {
  id: 'test',
  name: 'Тестовый этаж',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor', '+': 'door', ' ': 'void' },
  tiles: [
    '#####',
    '#...#',
    '#...+',
    '#...#',
    '#####',
  ],
  props: [],
}

describe('NavGrid', () => {
  it('определяет размеры из строк планировки', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.cols).toBe(5)
    expect(grid.rows).toBe(5)
  })

  it('читает тип клетки', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.tileAt({ col: 0, row: 0 })).toBe('wall')
    expect(grid.tileAt({ col: 1, row: 1 })).toBe('floor')
    expect(grid.tileAt({ col: 4, row: 2 })).toBe('door')
  })

  it('считает проходимыми пол и двери, но не стены', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.isWalkable({ col: 1, row: 1 })).toBe(true)
    expect(grid.isWalkable({ col: 4, row: 2 })).toBe(true)
    expect(grid.isWalkable({ col: 0, row: 0 })).toBe(false)
  })

  it('считает непроходимым всё за границами', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.inBounds({ col: -1, row: 0 })).toBe(false)
    expect(grid.isWalkable({ col: -1, row: 0 })).toBe(false)
    expect(grid.isWalkable({ col: 99, row: 99 })).toBe(false)
  })

  it('переводит клетку в центр клетки в метрах', () => {
    const grid = new NavGrid(PLAN)
    expect(grid.gridToWorld({ col: 0, row: 0 })).toEqual({ x: 0.5, z: 0.5 })
    expect(grid.gridToWorld({ col: 2, row: 3 })).toEqual({ x: 2.5, z: 3.5 })
  })

  it('переводит метры обратно в клетку', () => {
    expect(new NavGrid(PLAN).worldToGrid({ x: 2.7, z: 3.1 })).toEqual({ col: 2, row: 3 })
  })

  it('учитывает размер клетки при переводе координат', () => {
    const grid = new NavGrid({ ...PLAN, cellSize: 2 })
    expect(grid.gridToWorld({ col: 1, row: 1 })).toEqual({ x: 3, z: 3 })
    expect(grid.worldToGrid({ x: 3, z: 3 })).toEqual({ col: 1, row: 1 })
  })

  it('делает клетку с блокирующим предметом непроходимой', () => {
    const grid = new NavGrid({
      ...PLAN,
      props: [{ id: 'desk-1', kind: 'desk', col: 2, row: 2, rotation: 0, blocks: true }],
    })
    expect(grid.isWalkable({ col: 2, row: 2 })).toBe(false)
    expect(grid.isWalkable({ col: 1, row: 2 })).toBe(true)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- NavGrid`
Expected: FAIL — `Failed to resolve import "./FloorPlan"`.

- [ ] **Step 3: Создать `src/sim/world/PropDefinition.ts`**

```ts
import type { Needs } from '../needs/needs'

/** Действие, которое можно совершить с предметом. */
export interface Interaction {
  id: string
  /** Подпись в меню, на русском. */
  label: string
  /** Сколько игровых минут занимает. */
  durationMinutes: number
  /** Как меняются нужды по завершении. */
  needDelta: Partial<Needs>
}

/** Габариты предмета в метрах. */
export interface PropSize {
  w: number
  d: number
  h: number
}

export interface PropDefinition {
  kind: string
  /** Подпись в интерфейсе, на русском. */
  label: string
  size: PropSize
  /** Основной цвет в формате CSS hex. */
  color: string
  /** Делает ли предмет свою клетку непроходимой. */
  blocks: boolean
  /** Что можно сделать. Пустой список — предмет декоративный. */
  interactions: Interaction[]
}

export type PropCatalog = Record<string, PropDefinition>
```

- [ ] **Step 4: Создать `src/sim/world/FloorPlan.ts`**

```ts
export type TileKind = 'void' | 'floor' | 'wall' | 'door'

/** Размещение предмета обстановки на этаже. */
export interface PropPlacement {
  /** Уникальный в пределах этажа идентификатор. */
  id: string
  /** Ключ определения предмета в каталоге. */
  kind: string
  col: number
  row: number
  /** Поворот вокруг вертикальной оси в радианах. */
  rotation: number
  /** Делает ли предмет свою клетку непроходимой. По умолчанию false. */
  blocks?: boolean
}

/**
 * Планировка этажа. Единственный источник правды и для геометрии,
 * и для навигации — расхождение между видимым и проходимым исключено
 * по построению.
 */
export interface FloorPlan {
  id: string
  name: string
  /** Размер клетки в метрах. */
  cellSize: number
  /** Соответствие символов планировки типам клеток. */
  legend: Record<string, TileKind>
  /** Строки планировки, сверху вниз. Каждый символ — одна клетка. */
  tiles: readonly string[]
  props: readonly PropPlacement[]
}
```

- [ ] **Step 5: Создать `src/sim/world/NavGrid.ts`**

```ts
import type { GridPos, Vec2 } from '../types'
import type { FloorPlan, TileKind } from './FloorPlan'

const WALKABLE: ReadonlySet<TileKind> = new Set<TileKind>(['floor', 'door'])

export class NavGrid {
  readonly cols: number
  readonly rows: number
  readonly cellSize: number

  private readonly tiles: TileKind[][]
  private readonly blocked: Set<string>

  constructor(plan: FloorPlan) {
    this.cellSize = plan.cellSize
    this.rows = plan.tiles.length
    this.cols = plan.tiles.reduce((max, row) => Math.max(max, row.length), 0)

    this.tiles = plan.tiles.map((line) => {
      const row: TileKind[] = []
      for (let col = 0; col < this.cols; col++) {
        const char = line[col] ?? ' '
        row.push(plan.legend[char] ?? 'void')
      }
      return row
    })

    this.blocked = new Set(
      plan.props.filter((p) => p.blocks).map((p) => `${p.col},${p.row}`),
    )
  }

  inBounds(pos: GridPos): boolean {
    return pos.col >= 0 && pos.col < this.cols && pos.row >= 0 && pos.row < this.rows
  }

  tileAt(pos: GridPos): TileKind {
    if (!this.inBounds(pos)) return 'void'
    return this.tiles[pos.row]?.[pos.col] ?? 'void'
  }

  isWalkable(pos: GridPos): boolean {
    if (!this.inBounds(pos)) return false
    if (this.blocked.has(`${pos.col},${pos.row}`)) return false
    return WALKABLE.has(this.tileAt(pos))
  }

  /** Центр клетки в метрах. */
  gridToWorld(pos: GridPos): Vec2 {
    return {
      x: (pos.col + 0.5) * this.cellSize,
      z: (pos.row + 0.5) * this.cellSize,
    }
  }

  worldToGrid(point: Vec2): GridPos {
    return {
      col: Math.floor(point.x / this.cellSize),
      row: Math.floor(point.z / this.cellSize),
    }
  }
}
```

- [ ] **Step 6: Запустить тесты**

Run: `npm test -- NavGrid`
Expected: PASS, 8 тестов.

- [ ] **Step 7: Коммит**

```bash
git add src/sim/world
git commit -m "feat: определения предметов, планировка этажа и навигационная сетка"
```

---

### Task 5: Поиск пути

**Files:**
- Create: `src/sim/nav/findPath.ts`
- Test: `src/sim/nav/findPath.test.ts`

**Interfaces:**
- Consumes: `NavGrid`, `GridPos`.
- Produces: `function findPath(grid: NavGrid, from: GridPos, to: GridPos): GridPos[] | null` — путь **включает** стартовую и конечную клетки; `null`, если пути нет.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/nav/findPath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { findPath } from './findPath'

function makeGrid(tiles: string[]): NavGrid {
  const plan: FloorPlan = {
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor', ' ': 'void' },
    tiles,
    props: [],
  }
  return new NavGrid(plan)
}

describe('findPath', () => {
  it('находит прямой путь по открытой комнате', () => {
    const grid = makeGrid(['.....', '.....', '.....'])
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })
    expect(path).not.toBeNull()
    expect(path![0]).toEqual({ col: 0, row: 0 })
    expect(path![path!.length - 1]).toEqual({ col: 4, row: 0 })
  })

  it('возвращает путь из одной клетки, если старт равен цели', () => {
    expect(findPath(makeGrid(['...']), { col: 1, row: 0 }, { col: 1, row: 0 })).toEqual([
      { col: 1, row: 0 },
    ])
  })

  it('обходит стену', () => {
    const grid = makeGrid(['.....', '.###.', '.....'])
    const path = findPath(grid, { col: 2, row: 0 }, { col: 2, row: 2 })
    expect(path).not.toBeNull()
    for (const step of path!) expect(grid.isWalkable(step)).toBe(true)
  })

  it('возвращает null, если цель отрезана', () => {
    const grid = makeGrid(['..#..', '..#..', '..#..'])
    expect(findPath(grid, { col: 0, row: 0 }, { col: 4, row: 0 })).toBeNull()
  })

  it('возвращает null, если цель непроходима', () => {
    expect(findPath(makeGrid(['.#.']), { col: 0, row: 0 }, { col: 1, row: 0 })).toBeNull()
  })

  it('возвращает null, если старт непроходим', () => {
    expect(findPath(makeGrid(['.#.']), { col: 1, row: 0 }, { col: 2, row: 0 })).toBeNull()
  })

  it('соседние шаги пути всегда смежны по стороне', () => {
    const grid = makeGrid(['.....', '.###.', '.....'])
    const path = findPath(grid, { col: 0, row: 0 }, { col: 4, row: 2 })!
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1]!
      const cur = path[i]!
      expect(Math.abs(prev.col - cur.col) + Math.abs(prev.row - cur.row)).toBe(1)
    }
  })

  it('находит кратчайший путь по длине', () => {
    const grid = makeGrid(['.....', '.....'])
    expect(findPath(grid, { col: 0, row: 0 }, { col: 3, row: 1 })!.length).toBe(5)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- findPath`
Expected: FAIL — `Failed to resolve import "./findPath"`.

- [ ] **Step 3: Реализовать A\***

Создать `src/sim/nav/findPath.ts`:

```ts
import type { GridPos } from '../types'
import type { NavGrid } from '../world/NavGrid'

interface Node {
  pos: GridPos
  g: number
  f: number
  parent: string | null
}

const NEIGHBOURS: readonly GridPos[] = [
  { col: 1, row: 0 },
  { col: -1, row: 0 },
  { col: 0, row: 1 },
  { col: 0, row: -1 },
]

function key(pos: GridPos): string {
  return `${pos.col},${pos.row}`
}

function manhattan(a: GridPos, b: GridPos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row)
}

/**
 * Поиск пути A* по четырём направлениям.
 * Возвращает путь, включающий стартовую и конечную клетки, либо null.
 *
 * Диагонали намеренно запрещены: персонажи ходят по коридорам и между
 * партами, срезание углов по диагонали выглядит неправдоподобно.
 */
export function findPath(grid: NavGrid, from: GridPos, to: GridPos): GridPos[] | null {
  if (!grid.isWalkable(from) || !grid.isWalkable(to)) return null
  if (from.col === to.col && from.row === to.row) return [{ ...from }]

  const open = new Map<string, Node>()
  const closed = new Set<string>()
  const all = new Map<string, Node>()

  const start: Node = { pos: from, g: 0, f: manhattan(from, to), parent: null }
  open.set(key(from), start)
  all.set(key(from), start)

  while (open.size > 0) {
    let current: Node | null = null
    let currentKey = ''
    for (const [k, node] of open) {
      if (current === null || node.f < current.f) {
        current = node
        currentKey = k
      }
    }
    if (current === null) break

    if (current.pos.col === to.col && current.pos.row === to.row) {
      const path: GridPos[] = []
      let cursor: Node | undefined = current
      while (cursor) {
        path.unshift({ ...cursor.pos })
        cursor = cursor.parent ? all.get(cursor.parent) : undefined
      }
      return path
    }

    open.delete(currentKey)
    closed.add(currentKey)

    for (const offset of NEIGHBOURS) {
      const next: GridPos = {
        col: current.pos.col + offset.col,
        row: current.pos.row + offset.row,
      }
      const nextKey = key(next)
      if (closed.has(nextKey) || !grid.isWalkable(next)) continue

      const tentativeG = current.g + 1
      const existing = open.get(nextKey)
      if (existing && existing.g <= tentativeG) continue

      const node: Node = {
        pos: next,
        g: tentativeG,
        f: tentativeG + manhattan(next, to),
        parent: currentKey,
      }
      open.set(nextKey, node)
      all.set(nextKey, node)
    }
  }

  return null
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- findPath`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/nav
git commit -m "feat: поиск пути A* по навигационной сетке"
```

---

### Task 6: Актор и движение по пути

**Files:**
- Create: `src/sim/actor/Actor.ts`
- Test: `src/sim/actor/Actor.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `GridPos`, `NavGrid`, `findPath`.
- Produces:
  - `interface Actor { id, position, facing, speed, path, pathIndex }`
  - `function createActor(id: string, position: Vec2): Actor`
  - `function setDestination(actor: Actor, grid: NavGrid, target: GridPos): boolean`
  - `function stepActor(actor: Actor, grid: NavGrid, scaledSeconds: number): void`
  - `function isMoving(actor: Actor): boolean`
  - `const WALK_SPEED_MPS = 1.4`

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/actor/Actor.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { createActor, isMoving, setDestination, stepActor } from './Actor'

function makeGrid(): NavGrid {
  const plan: FloorPlan = {
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor' },
    tiles: ['.....', '.....', '.....'],
    props: [],
  }
  return new NavGrid(plan)
}

describe('Actor', () => {
  it('создаётся неподвижным', () => {
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    expect(isMoving(actor)).toBe(false)
    expect(actor.path).toEqual([])
  })

  it('принимает достижимую цель', () => {
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    expect(setDestination(actor, makeGrid(), { col: 4, row: 2 })).toBe(true)
    expect(isMoving(actor)).toBe(true)
  })

  it('отвергает недостижимую цель и не двигается', () => {
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    expect(setDestination(actor, makeGrid(), { col: 99, row: 99 })).toBe(false)
    expect(isMoving(actor)).toBe(false)
  })

  it('доходит до цели за достаточное время', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 4, row: 0 })
    for (let i = 0; i < 600; i++) stepActor(actor, grid, 0.05)
    expect(actor.position.x).toBeCloseTo(4.5, 2)
    expect(actor.position.z).toBeCloseTo(0.5, 2)
    expect(isMoving(actor)).toBe(false)
  })

  it('за один короткий шаг смещается, но не телепортируется', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 4, row: 0 })
    stepActor(actor, grid, 0.1)
    expect(actor.position.x).toBeGreaterThan(0.5)
    expect(actor.position.x).toBeLessThan(1.0)
  })

  it('не двигается, когда пути нет', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    stepActor(actor, grid, 1)
    expect(actor.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('смотрит вдоль +X при движении вправо', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 2, row: 0 })
    stepActor(actor, grid, 0.2)
    expect(actor.facing).toBeCloseTo(0, 3)
  })

  it('смотрит вдоль +Z при движении вниз по сетке', () => {
    const grid = makeGrid()
    const actor = createActor('student', { x: 0.5, z: 0.5 })
    setDestination(actor, grid, { col: 0, row: 2 })
    stepActor(actor, grid, 0.2)
    expect(actor.facing).toBeCloseTo(Math.PI / 2, 3)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- Actor`
Expected: FAIL — `Failed to resolve import "./Actor"`.

- [ ] **Step 3: Реализовать актора**

Создать `src/sim/actor/Actor.ts`:

```ts
import { findPath } from '../nav/findPath'
import type { GridPos, Vec2 } from '../types'
import type { NavGrid } from '../world/NavGrid'

/** Скорость пешей ходьбы в метрах за секунду масштабированного времени. */
export const WALK_SPEED_MPS = 1.4

export interface Actor {
  id: string
  /** Положение в метрах в плоскости XZ. */
  position: Vec2
  /** Направление взгляда в радианах, atan2(dz, dx). */
  facing: number
  speed: number
  /** Путь в клетках. Пуст, когда актор стоит. */
  path: GridPos[]
  /** Индекс следующей клетки в path. */
  pathIndex: number
}

export function createActor(id: string, position: Vec2): Actor {
  return {
    id,
    position: { ...position },
    facing: 0,
    speed: WALK_SPEED_MPS,
    path: [],
    pathIndex: 0,
  }
}

export function isMoving(actor: Actor): boolean {
  return actor.pathIndex < actor.path.length
}

/**
 * Прокладывает путь к целевой клетке.
 * Возвращает false, если идти некуда — путь не найден либо актор уже на месте.
 */
export function setDestination(actor: Actor, grid: NavGrid, target: GridPos): boolean {
  const from = grid.worldToGrid(actor.position)
  const path = findPath(grid, from, target)
  if (!path) {
    actor.path = []
    actor.pathIndex = 0
    return false
  }

  // Первая клетка пути — та, в которой актор уже стоит, её пропускаем.
  actor.path = path
  actor.pathIndex = 1
  return isMoving(actor)
}

/**
 * Продвигает актора вдоль пути.
 * @param scaledSeconds реальные секунды, умноженные на скорость игры.
 */
export function stepActor(actor: Actor, grid: NavGrid, scaledSeconds: number): void {
  let budget = actor.speed * scaledSeconds

  while (budget > 0 && isMoving(actor)) {
    const targetCell = actor.path[actor.pathIndex]
    if (!targetCell) break

    const target = grid.gridToWorld(targetCell)
    const dx = target.x - actor.position.x
    const dz = target.z - actor.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist < 1e-6) {
      actor.pathIndex++
      continue
    }

    actor.facing = Math.atan2(dz, dx)

    if (dist <= budget) {
      actor.position = { x: target.x, z: target.z }
      actor.pathIndex++
      budget -= dist
    } else {
      actor.position = {
        x: actor.position.x + (dx / dist) * budget,
        z: actor.position.z + (dz / dist) * budget,
      }
      budget = 0
    }
  }

  if (!isMoving(actor)) {
    actor.path = []
    actor.pathIndex = 0
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- Actor`
Expected: PASS, 8 тестов.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/actor
git commit -m "feat: актор с движением по проложенному пути"
```

---

### Task 7: Взаимодействия и подход к предмету

**Files:**
- Create: `src/sim/interaction/approach.ts`
- Test: `src/sim/interaction/approach.test.ts`

**Interfaces:**
- Consumes: `NavGrid`, `GridPos`.
- Produces: `function findApproachCell(grid: NavGrid, target: GridPos): GridPos | null` — клетка, с которой можно подойти к предмету; сама клетка предмета, если она проходима.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/interaction/approach.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../world/FloorPlan'
import { NavGrid } from '../world/NavGrid'
import { findApproachCell } from './approach'

function makeGrid(tiles: string[], props: FloorPlan['props'] = []): NavGrid {
  return new NavGrid({
    id: 'test',
    name: 'Тест',
    cellSize: 1,
    legend: { '#': 'wall', '.': 'floor' },
    tiles,
    props,
  })
}

describe('findApproachCell', () => {
  it('возвращает саму клетку, если она проходима', () => {
    expect(findApproachCell(makeGrid(['...']), { col: 1, row: 0 })).toEqual({
      col: 1,
      row: 0,
    })
  })

  it('возвращает соседнюю проходимую клетку, если предмет блокирует свою', () => {
    const grid = makeGrid(
      ['.....', '.....', '.....'],
      [{ id: 'coffee-1', kind: 'coffeeMachine', col: 4, row: 1, rotation: 0, blocks: true }],
    )
    const cell = findApproachCell(grid, { col: 4, row: 1 })
    expect(cell).not.toBeNull()
    expect(grid.isWalkable(cell!)).toBe(true)
  })

  it('возвращает null, если подойти негде', () => {
    expect(findApproachCell(makeGrid(['###', '###', '###']), { col: 1, row: 1 })).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- approach`
Expected: FAIL — `Failed to resolve import "./approach"`.

- [ ] **Step 3: Реализовать поиск клетки подхода**

Создать `src/sim/interaction/approach.ts`:

```ts
import type { GridPos } from '../types'
import type { NavGrid } from '../world/NavGrid'

const APPROACH_OFFSETS: readonly GridPos[] = [
  { col: 0, row: 1 },
  { col: 0, row: -1 },
  { col: 1, row: 0 },
  { col: -1, row: 0 },
]

/**
 * Ищет клетку, с которой можно подойти к предмету.
 * Если клетка самого предмета проходима — встаём прямо на неё.
 */
export function findApproachCell(grid: NavGrid, target: GridPos): GridPos | null {
  if (grid.isWalkable(target)) return { ...target }
  for (const offset of APPROACH_OFFSETS) {
    const candidate = { col: target.col + offset.col, row: target.row + offset.row }
    if (grid.isWalkable(candidate)) return candidate
  }
  return null
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test -- approach`
Expected: PASS, 3 теста.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/interaction
git commit -m "feat: поиск клетки подхода к предмету"
```

---

### Task 8: Мир — сборка симуляции

**Files:**
- Create: `src/sim/World.ts`
- Test: `src/sim/World.test.ts`

**Interfaces:**
- Consumes: `GameClock`, `Speed`, `Needs`, `createNeeds`, `decayNeeds`, `applyNeedDelta`, `calculateMood`, `NavGrid`, `FloorPlan`, `PropCatalog`, `Actor`, `createActor`, `setDestination`, `stepActor`, `isMoving`, `findApproachCell`.
- Produces:
  - `interface ActiveInteraction { propId, interactionId, label, remainingMinutes, needDelta }`
  - `interface WorldSnapshot { day, minutes, timeLabel, dayLabel, speed, needs, mood, playerPosition, playerFacing, isPlayerMoving, activity }`
  - `class World` — конструктор `(plan: FloorPlan, spawn: GridPos, catalog?: PropCatalog)`, поля `clock`, `grid`, `plan`, `catalog`, `player`, `needs`, `activeInteraction`, геттер `mood`, методы `tick`, `commandMoveTo`, `commandInteract`, `applyNeeds`, `snapshot`

Каталог предметов передаётся снаружи, а не импортируется — так `sim/` не зависит от `content/`.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/sim/World.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { World } from './World'
import type { FloorPlan } from './world/FloorPlan'
import type { PropCatalog } from './world/PropDefinition'

const PLAN: FloorPlan = {
  id: 'test',
  name: 'Тест',
  cellSize: 1,
  legend: { '#': 'wall', '.': 'floor' },
  tiles: ['.....', '.....', '.....'],
  props: [
    { id: 'coffee-1', kind: 'coffeeMachine', col: 4, row: 1, rotation: 0, blocks: true },
  ],
}

const CATALOG: PropCatalog = {
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 6,
        needDelta: { energy: 28, bladder: -12 },
      },
    ],
  },
}

function makeWorld(): World {
  return new World(PLAN, { col: 0, row: 0 }, CATALOG)
}

describe('World: время и нужды', () => {
  it('ставит игрока в центр стартовой клетки', () => {
    expect(makeWorld().player.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('продвигает часы при тике', () => {
    const world = makeWorld()
    const before = world.clock.totalMinutes
    world.tick(0.1)
    expect(world.clock.totalMinutes).toBeGreaterThan(before)
  })

  it('изнашивает нужды при тике', () => {
    const world = makeWorld()
    world.clock.speed = 3
    for (let i = 0; i < 100; i++) world.tick(0.1)
    expect(world.needs.energy).toBeLessThan(100)
    expect(world.needs.stress).toBeGreaterThan(0)
  })

  it('на паузе ничего не меняется', () => {
    const world = makeWorld()
    world.clock.speed = 0
    const before = world.snapshot()
    world.tick(0.2)
    const after = world.snapshot()
    expect(after.minutes).toBe(before.minutes)
    expect(after.needs.energy).toBe(before.needs.energy)
  })

  it('ограничивает длину одного тика, чтобы не проваливаться после сворачивания вкладки', () => {
    const world = makeWorld()
    world.clock.speed = 1
    world.tick(3600)
    expect(world.clock.totalMinutes - 7 * 60).toBeLessThanOrEqual(30)
  })

  it('применяет дельту нужд', () => {
    const world = makeWorld()
    world.applyNeeds({ hunger: -60 })
    expect(world.needs.hunger).toBe(40)
  })

  it('отдаёт снимок состояния с подписями на русском', () => {
    const snap = makeWorld().snapshot()
    expect(snap.timeLabel).toBe('07:00')
    expect(snap.dayLabel).toBe('Неделя 1, понедельник')
    expect(snap.mood).toBeGreaterThan(90)
    expect(snap.activity).toBeNull()
  })
})

describe('World: движение', () => {
  it('на паузе игрок не двигается', () => {
    const world = makeWorld()
    world.commandMoveTo({ col: 4, row: 0 })
    world.clock.speed = 0
    world.tick(0.2)
    expect(world.player.position).toEqual({ x: 0.5, z: 0.5 })
  })

  it('исполняет команду перемещения', () => {
    const world = makeWorld()
    expect(world.commandMoveTo({ col: 4, row: 2 })).toBe(true)
    for (let i = 0; i < 600; i++) world.tick(0.05)
    expect(world.player.position.x).toBeCloseTo(4.5, 2)
    expect(world.player.position.z).toBeCloseTo(2.5, 2)
  })

  it('отвергает команду в непроходимую клетку', () => {
    expect(makeWorld().commandMoveTo({ col: 50, row: 50 })).toBe(false)
  })
})

describe('World: взаимодействия', () => {
  it('отвергает взаимодействие с несуществующим предметом', () => {
    expect(makeWorld().commandInteract('нет-такого', 'drinkCoffee')).toBe(false)
  })

  it('отвергает неизвестное действие', () => {
    expect(makeWorld().commandInteract('coffee-1', 'нет-такого')).toBe(false)
  })

  it('принимает известное действие и ставит его в очередь', () => {
    const world = makeWorld()
    expect(world.commandInteract('coffee-1', 'drinkCoffee')).toBe(true)
    expect(world.activeInteraction?.interactionId).toBe('drinkCoffee')
  })

  it('не применяет эффект, пока персонаж идёт', () => {
    const world = makeWorld()
    world.applyNeeds({ energy: -60 })
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.tick(0.05)
    expect(world.needs.energy).toBeLessThanOrEqual(40)
    expect(world.activeInteraction).not.toBeNull()
  })

  it('применяет эффект после того, как персонаж дошёл и отработал время', () => {
    const world = makeWorld()
    world.applyNeeds({ energy: -60 })
    world.clock.speed = 3
    world.commandInteract('coffee-1', 'drinkCoffee')
    for (let i = 0; i < 200; i++) world.tick(0.05)
    expect(world.activeInteraction).toBeNull()
    expect(world.needs.energy).toBeGreaterThan(40)
  })

  it('показывает текущее занятие в снимке состояния', () => {
    const world = makeWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    expect(world.snapshot().activity).toBe('Взять кофе')
  })

  it('новая команда движения отменяет взаимодействие', () => {
    const world = makeWorld()
    world.commandInteract('coffee-1', 'drinkCoffee')
    world.commandMoveTo({ col: 0, row: 2 })
    expect(world.activeInteraction).toBeNull()
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- World`
Expected: FAIL — `Failed to resolve import "./World"`.

- [ ] **Step 3: Реализовать `World`**

Создать `src/sim/World.ts`:

```ts
import { createActor, isMoving, setDestination, stepActor, type Actor } from './actor/Actor'
import { findApproachCell } from './interaction/approach'
import {
  applyNeedDelta,
  calculateMood,
  createNeeds,
  decayNeeds,
  type Needs,
} from './needs/needs'
import { GameClock, type Speed } from './time/GameClock'
import type { GridPos, Vec2 } from './types'
import type { FloorPlan } from './world/FloorPlan'
import { NavGrid } from './world/NavGrid'
import type { PropCatalog } from './world/PropDefinition'

/**
 * Максимальная длительность одного тика в реальных секундах.
 * Защищает от гигантского скачка после того, как вкладка была свёрнута.
 */
const MAX_TICK_SECONDS = 0.25

export interface ActiveInteraction {
  propId: string
  interactionId: string
  label: string
  /** Сколько игровых минут действия осталось. Тикает только когда персонаж дошёл. */
  remainingMinutes: number
  needDelta: Partial<Needs>
}

export interface WorldSnapshot {
  day: number
  minutes: number
  timeLabel: string
  dayLabel: string
  speed: Speed
  needs: Needs
  mood: number
  playerPosition: Vec2
  playerFacing: number
  isPlayerMoving: boolean
  /** Подпись текущего занятия или null, если персонаж свободен. */
  activity: string | null
}

/**
 * Корень симуляции. Владеет временем, миром и состоянием игрока.
 * Ничего не знает о рендере: слой представления читает snapshot().
 * Каталог предметов передаётся снаружи, чтобы sim не зависел от content.
 */
export class World {
  readonly clock = new GameClock()
  readonly grid: NavGrid
  readonly plan: FloorPlan
  readonly catalog: PropCatalog
  player: Actor
  needs: Needs = createNeeds()
  activeInteraction: ActiveInteraction | null = null

  constructor(plan: FloorPlan, spawn: GridPos, catalog: PropCatalog = {}) {
    this.plan = plan
    this.catalog = catalog
    this.grid = new NavGrid(plan)
    this.player = createActor('player', this.grid.gridToWorld(spawn))
  }

  get mood(): number {
    return calculateMood(this.needs)
  }

  /** @param realDeltaSeconds время, прошедшее с прошлого кадра. */
  tick(realDeltaSeconds: number): void {
    const delta = Math.min(realDeltaSeconds, MAX_TICK_SECONDS)
    const gameMinutes = this.clock.advance(delta)
    if (gameMinutes === 0) return

    this.needs = decayNeeds(this.needs, gameMinutes)
    stepActor(this.player, this.grid, delta * this.clock.speed)
    this.advanceInteraction(gameMinutes)
  }

  commandMoveTo(target: GridPos): boolean {
    this.activeInteraction = null
    return setDestination(this.player, this.grid, target)
  }

  /**
   * Отправляет персонажа к предмету и ставит действие в очередь.
   * Эффект применится, когда персонаж дойдёт и отработает длительность.
   */
  commandInteract(propId: string, interactionId: string): boolean {
    const placement = this.plan.props.find((p) => p.id === propId)
    if (!placement) return false

    const definition = this.catalog[placement.kind]
    if (!definition) return false

    const interaction = definition.interactions.find((i) => i.id === interactionId)
    if (!interaction) return false

    const approach = findApproachCell(this.grid, { col: placement.col, row: placement.row })
    if (!approach) return false

    // Если персонаж уже стоит в клетке подхода, setDestination вернёт false —
    // это не ошибка, а признак того, что идти никуда не надо.
    setDestination(this.player, this.grid, approach)

    this.activeInteraction = {
      propId,
      interactionId,
      label: interaction.label,
      remainingMinutes: interaction.durationMinutes,
      needDelta: interaction.needDelta,
    }
    return true
  }

  applyNeeds(delta: Partial<Needs>): void {
    this.needs = applyNeedDelta(this.needs, delta)
  }

  snapshot(): WorldSnapshot {
    const { day, minutes } = this.clock.time
    return {
      day,
      minutes,
      timeLabel: this.clock.formatTime(),
      dayLabel: this.clock.formatDay(),
      speed: this.clock.speed,
      needs: this.needs,
      mood: this.mood,
      playerPosition: { ...this.player.position },
      playerFacing: this.player.facing,
      isPlayerMoving: isMoving(this.player),
      activity: this.activeInteraction?.label ?? null,
    }
  }

  private advanceInteraction(gameMinutes: number): void {
    const active = this.activeInteraction
    if (!active) return
    // Пока персонаж идёт к предмету, действие не выполняется.
    if (isMoving(this.player)) return

    active.remainingMinutes -= gameMinutes
    if (active.remainingMinutes <= 0) {
      this.applyNeeds(active.needDelta)
      this.activeInteraction = null
    }
  }
}
```

- [ ] **Step 4: Запустить все тесты**

Run: `npm test`
Expected: PASS. Тесты границы слоёв по-прежнему зелёные — `World.ts` не импортирует ни React, ни three, ни `content/`.

- [ ] **Step 5: Коммит**

```bash
git add src/sim/World.ts src/sim/World.test.ts
git commit -m "feat: мир — время, нужды, движение и взаимодействия игрока"
```

---

### Task 9: Данные — каталог предметов и второй этаж корпуса А

**Files:**
- Create: `src/content/props/propCatalog.ts`
- Create: `src/content/floors/floorA2.ts`
- Test: `src/content/floors/floorA2.test.ts`

**Interfaces:**
- Consumes: `PropCatalog`, `PropDefinition`, `FloorPlan`, `GridPos`, `NavGrid`, `findPath`, `findApproachCell`.
- Produces:
  - `const PROP_CATALOG: PropCatalog`
  - `const FLOOR_A2: FloorPlan`
  - `const FLOOR_A2_SPAWN: GridPos`

Первый игровой уровень — **лифтовый холл и коридор второго этажа корпуса А**. По официальным маршрутам ВШЭ (`research/building.md`) это отправная точка всей навигации по комплексу: отсюда идут пути и в аудитории, и через стеклянный переход в столовую. Достоверные детали, ради которых он выбран: единственный лифтовый холл, изогнутый коридор с окнами, пурифайеры и автоматы с едой и кофе в коридоре, настоящая нумерация аудиторий вида `А-204`.

Форма коридора в планировке — прямоугольная аппроксимация изогнутого; полукруглая геометрия двора появится, когда этажей станет несколько.

- [ ] **Step 1: Написать падающие тесты**

Создать `src/content/floors/floorA2.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { findApproachCell } from '../../sim/interaction/approach'
import { findPath } from '../../sim/nav/findPath'
import { NavGrid } from '../../sim/world/NavGrid'
import { PROP_CATALOG } from '../props/propCatalog'
import { FLOOR_A2, FLOOR_A2_SPAWN } from './floorA2'

describe('корпус А, 2 этаж', () => {
  it('все строки планировки одной длины', () => {
    const width = FLOOR_A2.tiles[0]!.length
    for (const row of FLOOR_A2.tiles) expect(row.length).toBe(width)
  })

  it('все символы планировки есть в легенде', () => {
    for (const row of FLOOR_A2.tiles) {
      for (const char of row) expect(FLOOR_A2.legend[char]).toBeDefined()
    }
  })

  it('все размещённые предметы есть в каталоге', () => {
    for (const prop of FLOOR_A2.props) expect(PROP_CATALOG[prop.kind]).toBeDefined()
  })

  it('идентификаторы предметов уникальны', () => {
    const ids = FLOOR_A2.props.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('предметы не стоят внутри стен', () => {
    const bare = new NavGrid({ ...FLOOR_A2, props: [] })
    for (const prop of FLOOR_A2.props) {
      expect(bare.tileAt({ col: prop.col, row: prop.row }), prop.id).not.toBe('wall')
    }
  })

  it('точка появления игрока проходима', () => {
    expect(new NavGrid(FLOOR_A2).isWalkable(FLOOR_A2_SPAWN)).toBe(true)
  })

  it('от точки появления достижим каждый предмет', () => {
    const grid = new NavGrid(FLOOR_A2)
    for (const prop of FLOOR_A2.props) {
      const approach = findApproachCell(grid, { col: prop.col, row: prop.row })
      expect(approach, `к ${prop.id} негде подойти`).not.toBeNull()
      expect(findPath(grid, FLOOR_A2_SPAWN, approach!), `${prop.id} недостижим`).not.toBeNull()
    }
  })

  it('обе аудитории достижимы из коридора', () => {
    const grid = new NavGrid(FLOOR_A2)
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 4, row: 2 })).not.toBeNull()
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 18, row: 2 })).not.toBeNull()
  })

  it('лифтовый холл и туалеты достижимы', () => {
    const grid = new NavGrid(FLOOR_A2)
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 19, row: 10 })).not.toBeNull()
    expect(findPath(grid, FLOOR_A2_SPAWN, { col: 3, row: 10 })).not.toBeNull()
  })

  it('у каждого предмета в каталоге есть хотя бы одно действие', () => {
    for (const definition of Object.values(PROP_CATALOG)) {
      expect(definition.interactions.length, definition.kind).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- floorA2`
Expected: FAIL — `Failed to resolve import "../props/propCatalog"`.

- [ ] **Step 3: Создать каталог предметов**

Создать `src/content/props/propCatalog.ts`:

```ts
import type { PropCatalog } from '../../sim/world/PropDefinition'

/**
 * Каталог предметов второго этажа корпуса А.
 * Числа в needDelta — игровой баланс, а не физика: кофе бодрит сильно,
 * но бьёт по мочевому пузырю; ожидание лифта не даёт ничего, кроме
 * стресса, и это ровно то, чего мы добиваемся.
 */
export const PROP_CATALOG: PropCatalog = {
  desk: {
    kind: 'desk',
    label: 'Парта',
    size: { w: 1.2, d: 0.6, h: 0.75 },
    color: '#c8b18b',
    blocks: true,
    interactions: [
      {
        id: 'sitAndListen',
        label: 'Сесть и слушать',
        durationMinutes: 40,
        needDelta: { energy: -6, fun: -10, social: -4 },
      },
      {
        id: 'scrollPhone',
        label: 'Залипнуть в телефон',
        durationMinutes: 15,
        needDelta: { fun: 18, stress: -6 },
      },
    ],
  },
  whiteboard: {
    kind: 'whiteboard',
    label: 'Доска',
    size: { w: 2.4, d: 0.1, h: 1.2 },
    color: '#2b3a2f',
    blocks: true,
    interactions: [
      {
        id: 'readBoard',
        label: 'Разобрать, что написано',
        durationMinutes: 5,
        needDelta: { stress: 4 },
      },
    ],
  },
  purifier: {
    kind: 'purifier',
    label: 'Пурифайер',
    size: { w: 0.4, d: 0.4, h: 1.3 },
    color: '#5f8fa8',
    blocks: true,
    interactions: [
      {
        id: 'drinkWater',
        label: 'Набрать воды',
        durationMinutes: 2,
        needDelta: { hunger: 4, bladder: -6, stress: -2 },
      },
    ],
  },
  vendingMachine: {
    kind: 'vendingMachine',
    label: 'Автомат с едой',
    size: { w: 0.9, d: 0.8, h: 1.9 },
    color: '#3b4b5e',
    blocks: true,
    interactions: [
      {
        id: 'buySnack',
        label: 'Взять шоколадку',
        durationMinutes: 3,
        needDelta: { hunger: 20, fun: 6 },
      },
    ],
  },
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 6,
        needDelta: { energy: 28, hunger: 6, bladder: -12 },
      },
    ],
  },
  bench: {
    kind: 'bench',
    label: 'Скамейка в коридоре',
    size: { w: 1.6, d: 0.5, h: 0.45 },
    color: '#8a6f4d',
    blocks: true,
    interactions: [
      {
        id: 'rest',
        label: 'Посидеть',
        durationMinutes: 15,
        needDelta: { energy: 10, stress: -10 },
      },
      {
        id: 'readBeforeClass',
        label: 'Дочитать перед парой',
        durationMinutes: 20,
        needDelta: { energy: -5, stress: -12, fun: -4 },
      },
    ],
  },
  noticeBoard: {
    kind: 'noticeBoard',
    label: 'Доска объявлений',
    size: { w: 1.4, d: 0.1, h: 1.0 },
    color: '#102d69',
    blocks: true,
    interactions: [
      {
        id: 'readNotices',
        label: 'Почитать объявления',
        durationMinutes: 4,
        needDelta: { fun: 6, stress: -2 },
      },
    ],
  },
  toilet: {
    kind: 'toilet',
    label: 'Туалет',
    size: { w: 0.6, d: 0.7, h: 0.8 },
    color: '#dfe3e6',
    blocks: true,
    interactions: [
      {
        id: 'relieve',
        label: 'Сходить в туалет',
        durationMinutes: 5,
        needDelta: { bladder: 100 },
      },
    ],
  },
  elevator: {
    kind: 'elevator',
    label: 'Лифт',
    size: { w: 1.6, d: 0.3, h: 2.2 },
    color: '#9aa3ab',
    blocks: true,
    interactions: [
      {
        id: 'waitForElevator',
        label: 'Ждать лифт',
        durationMinutes: 9,
        needDelta: { stress: 12, fun: -8 },
      },
    ],
  },
  stairs: {
    kind: 'stairs',
    label: 'Лестница',
    size: { w: 1.0, d: 1.0, h: 0.5 },
    color: '#a49c8e',
    blocks: false,
    interactions: [
      {
        id: 'takeStairs',
        label: 'Пойти пешком',
        durationMinutes: 3,
        needDelta: { energy: -8, stress: -4 },
      },
    ],
  },
}
```

- [ ] **Step 4: Создать планировку второго этажа корпуса А**

Создать `src/content/floors/floorA2.ts`:

```ts
import type { GridPos } from '../../sim/types'
import type { FloorPlan } from '../../sim/world/FloorPlan'

/**
 * Корпус А, 2 этаж — лифтовый холл и коридор.
 * Опирается на research/building.md: это отправная точка всей навигации
 * по комплексу на Старой Басманной.
 *
 * Сверху — две аудитории (А-204 слева, А-206 справа), между ними и
 * коридором дверные проёмы. Посередине — коридор с пурифайером,
 * автоматами, доской объявлений и скамейкой. Снизу слева — туалеты,
 * снизу справа — лифтовый холл с единственным лифтом и лестницей.
 *
 * Легенда: # стена, . пол, + дверной проём, пробел — вне здания.
 */
export const FLOOR_A2: FloorPlan = {
  id: 'basmannaya-a2',
  name: 'Старая Басманная, корпус А, 2 этаж',
  cellSize: 1,
  legend: {
    '#': 'wall',
    '.': 'floor',
    '+': 'door',
    ' ': 'void',
  },
  tiles: [
    '########################',
    '#........#####.........#',
    '#........#####.........#',
    '#........#####.........#',
    '#........#####.........#',
    '####+#############+#####',
    '#......................#',
    '#......................#',
    '###+################+###',
    '#......##########......#',
    '#......##########......#',
    '#......##########......#',
    '########################',
  ],
  props: [
    // Аудитория А-204
    { id: 'a204-board', kind: 'whiteboard', col: 4, row: 1, rotation: 0, blocks: true },
    { id: 'a204-desk-1', kind: 'desk', col: 2, row: 3, rotation: 0, blocks: true },
    { id: 'a204-desk-2', kind: 'desk', col: 4, row: 3, rotation: 0, blocks: true },
    { id: 'a204-desk-3', kind: 'desk', col: 6, row: 3, rotation: 0, blocks: true },

    // Аудитория А-206
    { id: 'a206-board', kind: 'whiteboard', col: 18, row: 1, rotation: 0, blocks: true },
    { id: 'a206-desk-1', kind: 'desk', col: 16, row: 3, rotation: 0, blocks: true },
    { id: 'a206-desk-2', kind: 'desk', col: 18, row: 3, rotation: 0, blocks: true },
    { id: 'a206-desk-3', kind: 'desk', col: 20, row: 3, rotation: 0, blocks: true },

    // Коридор
    { id: 'notices-1', kind: 'noticeBoard', col: 3, row: 6, rotation: 0, blocks: true },
    { id: 'purifier-1', kind: 'purifier', col: 10, row: 6, rotation: 0, blocks: true },
    { id: 'vending-1', kind: 'vendingMachine', col: 11, row: 6, rotation: 0, blocks: true },
    { id: 'coffee-1', kind: 'coffeeMachine', col: 12, row: 6, rotation: 0, blocks: true },
    { id: 'bench-1', kind: 'bench', col: 20, row: 6, rotation: 0, blocks: true },

    // Туалеты
    { id: 'toilet-1', kind: 'toilet', col: 2, row: 10, rotation: 0, blocks: true },
    { id: 'toilet-2', kind: 'toilet', col: 4, row: 10, rotation: 0, blocks: true },

    // Лифтовый холл
    { id: 'stairs-1', kind: 'stairs', col: 18, row: 10, rotation: 0 },
    { id: 'elevator-1', kind: 'elevator', col: 21, row: 10, rotation: 0, blocks: true },
  ],
}

/** Где появляется игрок: посреди коридора, у автоматов. */
export const FLOOR_A2_SPAWN: GridPos = { col: 11, row: 7 }
```

- [ ] **Step 5: Запустить тесты**

Run: `npm test -- floorA2`
Expected: PASS, 10 тестов.

Если тест достижимости падает — двигать предмет или клетку появления до зелёного результата. Планировка правится под тест, а не тест под планировку: тест выражает требование «до всего можно дойти».

- [ ] **Step 6: Коммит**

```bash
git add src/content
git commit -m "feat: каталог предметов и планировка второго этажа корпуса А"
```

---

### Task 10: Сцена, изометрическая камера и мост к симуляции

**Files:**
- Create: `src/render/useWorld.ts`
- Create: `src/render/GameCanvas.tsx`
- Modify: `src/render/App.tsx`

**Interfaces:**
- Consumes: `World`, `WorldSnapshot`, `FLOOR_A2`, `FLOOR_A2_SPAWN`, `PROP_CATALOG`.
- Produces:
  - `function WorldProvider({ children }: { children: ReactNode }): ReactElement`
  - `function useWorld(): World`
  - `function useWorldSnapshot(): WorldSnapshot` — обновляется 10 раз в секунду
  - `function GameCanvas(): ReactElement`

Сцена проверяется глазами в браузере. Автотестами покрыта симуляция — тесты рендера трёхмерной сцены дороги и хрупки, и на этом этапе не окупаются.

- [ ] **Step 1: Создать мост между симуляцией и React**

Создать `src/render/useWorld.ts`:

```ts
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { FLOOR_A2, FLOOR_A2_SPAWN } from '../content/floors/floorA2'
import { PROP_CATALOG } from '../content/props/propCatalog'
import { World, type WorldSnapshot } from '../sim/World'

const WorldContext = createContext<World | null>(null)

const SNAPSHOT_INTERVAL_MS = 100

/**
 * Симуляция живёт вне React: экземпляр World создаётся один раз и мутируется
 * в игровом цикле. React читает из него снимки по таймеру, а не каждый кадр,
 * иначе реконсиляция съест частоту кадров на ускоренном времени.
 */
export function WorldProvider({ children }: { children: ReactNode }) {
  const worldRef = useRef<World | null>(null)
  worldRef.current ??= new World(FLOOR_A2, FLOOR_A2_SPAWN, PROP_CATALOG)
  return createElement(WorldContext.Provider, { value: worldRef.current }, children)
}

export function useWorld(): World {
  const world = useContext(WorldContext)
  if (!world) throw new Error('useWorld вызван вне WorldProvider')
  return world
}

export function useWorldSnapshot(): WorldSnapshot {
  const world = useWorld()
  const [snapshot, setSnapshot] = useState<WorldSnapshot>(() => world.snapshot())

  useEffect(() => {
    const id = setInterval(() => setSnapshot(world.snapshot()), SNAPSHOT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [world])

  return snapshot
}
```

- [ ] **Step 2: Создать сцену с изометрической камерой**

Создать `src/render/GameCanvas.tsx`:

```tsx
import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useWorld } from './useWorld'

/** Гоняет симуляцию в такт кадрам. Ничего не рисует. */
function SimulationLoop() {
  const world = useWorld()
  useFrame((_, delta) => world.tick(delta))
  return null
}

export function GameCanvas() {
  return (
    <Canvas
      shadows
      camera={{ position: [22, 20, 26], fov: 32 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0f1116']} />
      <SimulationLoop />

      <hemisphereLight intensity={0.55} groundColor="#2a2622" />
      <directionalLight
        position={[16, 24, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12, -0.02, 6]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#191c22" />
      </mesh>

      <OrbitControls
        target={[12, 0, 6]}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        minDistance={14}
        maxDistance={55}
      />
    </Canvas>
  )
}
```

- [ ] **Step 3: Подключить сцену в `App.tsx`**

Полностью заменить `src/render/App.tsx`:

```tsx
import { GameCanvas } from './GameCanvas'
import { WorldProvider } from './useWorld'

export function App() {
  return (
    <WorldProvider>
      <GameCanvas />
    </WorldProvider>
  )
}
```

- [ ] **Step 4: Проверить в браузере**

Run: `npm run dev`
Expected: открывается страница, видна тёмная плоскость под изометрическим углом. Камера вращается перетаскиванием и зумится колесом, наклон ограничен — под пол провалиться нельзя.

- [ ] **Step 5: Проверить типы и тесты**

Run: `npm run build && npm test`
Expected: обе команды успешны.

- [ ] **Step 6: Коммит**

```bash
git add src/render
git commit -m "feat: изометрическая сцена и мост между симуляцией и React"
```

---

### Task 11: Геометрия этажа из планировки

**Files:**
- Create: `src/render/building/PropMesh.tsx`
- Create: `src/render/building/FloorMesh.tsx`
- Modify: `src/render/GameCanvas.tsx`

**Interfaces:**
- Consumes: `FloorPlan`, `PropPlacement`, `PropCatalog`, `useWorld`.
- Produces:
  - `const WALL_HEIGHT = 3`
  - `function PropMesh({ placement, cellSize, catalog, onSelect }): ReactElement | null`
  - `function FloorMesh({ plan, catalog, onSelectProp }): ReactElement`

Предметы сразу делаются кликабельными — меню действий появится в Задаче 14, но пробрасывать обработчик потом дороже, чем заложить его сейчас.

- [ ] **Step 1: Создать отрисовку предмета**

Создать `src/render/building/PropMesh.tsx`:

```tsx
import type { PropPlacement } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'

export const WALL_HEIGHT = 3

export function PropMesh({
  placement,
  cellSize,
  catalog,
  onSelect,
}: {
  placement: PropPlacement
  cellSize: number
  catalog: PropCatalog
  onSelect: (propId: string) => void
}) {
  const definition = catalog[placement.kind]
  if (!definition) return null

  const x = (placement.col + 0.5) * cellSize
  const z = (placement.row + 0.5) * cellSize
  const { w, d, h } = definition.size

  return (
    <mesh
      position={[x, h / 2, z]}
      rotation={[0, placement.rotation, 0]}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation()
        onSelect(placement.id)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto'
      }}
    >
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={definition.color} roughness={0.8} />
    </mesh>
  )
}
```

- [ ] **Step 2: Создать генератор геометрии этажа**

Создать `src/render/building/FloorMesh.tsx`:

```tsx
import { useMemo } from 'react'
import type { FloorPlan, TileKind } from '../../sim/world/FloorPlan'
import type { PropCatalog } from '../../sim/world/PropDefinition'
import { PropMesh, WALL_HEIGHT } from './PropMesh'

interface Cell {
  col: number
  row: number
  kind: TileKind
}

const FLOOR_COLOR = '#b9ab93'
const WALL_COLOR = '#e6e1d6'
const DOOR_COLOR = '#7a5c3a'

function readCells(plan: FloorPlan): Cell[] {
  const cells: Cell[] = []
  plan.tiles.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const char = line[col] ?? ' '
      const kind = plan.legend[char] ?? 'void'
      if (kind !== 'void') cells.push({ col, row, kind })
    }
  })
  return cells
}

/**
 * Строит геометрию этажа из той же планировки, по которой считается навигация.
 * Один источник правды — видимое и проходимое не могут разойтись.
 */
export function FloorMesh({
  plan,
  catalog,
  onSelectProp,
}: {
  plan: FloorPlan
  catalog: PropCatalog
  onSelectProp: (propId: string) => void
}) {
  const cells = useMemo(() => readCells(plan), [plan])
  const size = plan.cellSize

  return (
    <group>
      {cells.map((cell) => {
        const x = (cell.col + 0.5) * size
        const z = (cell.row + 0.5) * size

        if (cell.kind === 'wall') {
          return (
            <mesh
              key={`w-${cell.col}-${cell.row}`}
              position={[x, WALL_HEIGHT / 2, z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[size, WALL_HEIGHT, size]} />
              <meshStandardMaterial color={WALL_COLOR} roughness={0.95} />
            </mesh>
          )
        }

        return (
          <mesh
            key={`f-${cell.col}-${cell.row}`}
            position={[x, 0, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[size, size]} />
            <meshStandardMaterial
              color={cell.kind === 'door' ? DOOR_COLOR : FLOOR_COLOR}
              roughness={0.9}
            />
          </mesh>
        )
      })}

      {plan.props.map((placement) => (
        <PropMesh
          key={placement.id}
          placement={placement}
          cellSize={size}
          catalog={catalog}
          onSelect={onSelectProp}
        />
      ))}
    </group>
  )
}
```

- [ ] **Step 3: Переписать `GameCanvas.tsx` целиком**

```tsx
import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { FloorMesh } from './building/FloorMesh'
import { useWorld } from './useWorld'

/** Гоняет симуляцию в такт кадрам. Ничего не рисует. */
function SimulationLoop() {
  const world = useWorld()
  useFrame((_, delta) => world.tick(delta))
  return null
}

function Scene({ onSelectProp }: { onSelectProp: (propId: string) => void }) {
  const world = useWorld()
  return <FloorMesh plan={world.plan} catalog={world.catalog} onSelectProp={onSelectProp} />
}

export function GameCanvas({ onSelectProp }: { onSelectProp: (propId: string) => void }) {
  return (
    <Canvas
      shadows
      camera={{ position: [22, 20, 26], fov: 32 }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#0f1116']} />
      <SimulationLoop />

      <hemisphereLight intensity={0.55} groundColor="#2a2622" />
      <directionalLight
        position={[16, 24, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      <Scene onSelectProp={onSelectProp} />

      <OrbitControls
        target={[12, 0, 6]}
        enablePan={false}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.6}
        minDistance={14}
        maxDistance={55}
      />
    </Canvas>
  )
}
```

- [ ] **Step 4: Обновить `App.tsx` под новую сигнатуру**

```tsx
import { useState } from 'react'
import { GameCanvas } from './GameCanvas'
import { WorldProvider } from './useWorld'

export function App() {
  const [, setSelectedProp] = useState<string | null>(null)

  return (
    <WorldProvider>
      <GameCanvas onSelectProp={setSelectedProp} />
    </WorldProvider>
  )
}
```

- [ ] **Step 5: Проверить в браузере**

Run: `npm run dev`
Expected: виден второй этаж корпуса А — светлые стены, песочный пол, тёмные дверные проёмы. Сверху две аудитории с партами и досками, посередине коридор с пурифайером, автоматом с едой и кофейным автоматом, снизу слева туалеты, снизу справа лифт и лестница. Тени падают. Курсор становится указателем при наведении на предмет.

- [ ] **Step 6: Проверить сборку**

Run: `npm run build && npm test`
Expected: успешно.

- [ ] **Step 7: Коммит**

```bash
git add src/render
git commit -m "feat: генерация геометрии этажа и предметов из планировки"
```

---

### Task 12: Процедурный персонаж за подменяемым слоем

**Files:**
- Create: `src/render/character/CharacterAppearance.ts`
- Create: `src/render/character/ProceduralCharacter.tsx`
- Create: `src/render/character/PlayerCharacter.tsx`
- Modify: `src/render/GameCanvas.tsx`
- Test: `src/render/character/CharacterAppearance.test.ts`

**Interfaces:**
- Consumes: `useWorld`, `isMoving`.
- Produces:
  - `type HairStyle = 'short' | 'medium' | 'bald' | 'ponytail'`
  - `type FacialHair = 'none' | 'stubble' | 'beard' | 'moustache'`
  - `interface CharacterAppearance { height, build, skin, hair, hairStyle, facialHair, glasses, top, bottom }`
  - `function createAppearance(overrides?: Partial<CharacterAppearance>): CharacterAppearance`
  - `function ProceduralCharacter({ appearance, walking }): ReactElement`
  - `function PlayerCharacter(): ReactElement`

`PlayerCharacter` содержит всю связь с симуляцией и не знает, чем рисуется тело. Чтобы перейти на готовые GLTF-модели, достаточно подставить другой компонент вместо `ProceduralCharacter` — симуляция, ИИ и сцены не меняются.

- [ ] **Step 1: Написать падающий тест модели внешности**

Создать `src/render/character/CharacterAppearance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createAppearance } from './CharacterAppearance'

describe('внешность персонажа', () => {
  it('имеет разумные значения по умолчанию', () => {
    const look = createAppearance()
    expect(look.height).toBeGreaterThan(1.5)
    expect(look.height).toBeLessThan(2.1)
    expect(look.glasses).toBe(false)
  })

  it('принимает переопределения', () => {
    const look = createAppearance({ facialHair: 'beard', glasses: true, height: 1.9 })
    expect(look.facialHair).toBe('beard')
    expect(look.glasses).toBe(true)
    expect(look.height).toBe(1.9)
  })

  it('зажимает телосложение в диапазон 0..1', () => {
    expect(createAppearance({ build: 5 }).build).toBe(1)
    expect(createAppearance({ build: -3 }).build).toBe(0)
  })
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `npm test -- CharacterAppearance`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать модель внешности**

Создать `src/render/character/CharacterAppearance.ts`:

```ts
export type HairStyle = 'short' | 'medium' | 'bald' | 'ponytail'
export type FacialHair = 'none' | 'stubble' | 'beard' | 'moustache'

/**
 * Параметрическое описание внешности. Конкретный человек — это набор
 * значений, а не отдельная модель. Тех же параметров хватит, чтобы позже
 * выбрать вариант готовой GLTF-модели.
 */
export interface CharacterAppearance {
  /** Рост в метрах. */
  height: number
  /** Телосложение: 0 — худой, 1 — плотный. */
  build: number
  skin: string
  hair: string
  hairStyle: HairStyle
  facialHair: FacialHair
  glasses: boolean
  top: string
  bottom: string
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function createAppearance(
  overrides: Partial<CharacterAppearance> = {},
): CharacterAppearance {
  const merged: CharacterAppearance = {
    height: 1.75,
    build: 0.4,
    skin: '#e0b48f',
    hair: '#3a2c22',
    hairStyle: 'short',
    facialHair: 'none',
    glasses: false,
    top: '#41516b',
    bottom: '#2d3138',
    ...overrides,
  }
  merged.build = clamp01(merged.build)
  return merged
}
```

- [ ] **Step 4: Запустить тест**

Run: `npm test -- CharacterAppearance`
Expected: PASS, 3 теста.

- [ ] **Step 5: Реализовать процедурную модель**

Создать `src/render/character/ProceduralCharacter.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import type { CharacterAppearance } from './CharacterAppearance'

/**
 * Процедурная модель человека из примитивов. Пропорции строятся от роста,
 * поэтому персонажи разного роста остаются анатомически похожими.
 * Модель смотрит вдоль +Z.
 */
export function ProceduralCharacter({
  appearance,
  walking,
}: {
  appearance: CharacterAppearance
  walking: boolean
}) {
  const legLeft = useRef<Group>(null)
  const legRight = useRef<Group>(null)
  const armLeft = useRef<Group>(null)
  const armRight = useRef<Group>(null)

  const h = appearance.height
  const girth = 0.16 + appearance.build * 0.1
  const legLength = h * 0.46
  const torsoHeight = h * 0.31
  const headRadius = h * 0.072
  const shoulderY = legLength + torsoHeight
  const armLength = h * 0.33

  useFrame((state) => {
    const swing = walking ? Math.sin(state.clock.elapsedTime * 8) * 0.6 : 0
    if (legLeft.current) legLeft.current.rotation.x = swing
    if (legRight.current) legRight.current.rotation.x = -swing
    if (armLeft.current) armLeft.current.rotation.x = -swing * 0.7
    if (armRight.current) armRight.current.rotation.x = swing * 0.7
  })

  return (
    <group>
      <group ref={legLeft} position={[-girth * 0.5, legLength, 0]}>
        <mesh position={[0, -legLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.3, legLength * 0.8, 4, 8]} />
          <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
        </mesh>
      </group>
      <group ref={legRight} position={[girth * 0.5, legLength, 0]}>
        <mesh position={[0, -legLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.3, legLength * 0.8, 4, 8]} />
          <meshStandardMaterial color={appearance.bottom} roughness={0.9} />
        </mesh>
      </group>

      <mesh position={[0, legLength + torsoHeight / 2, 0]} castShadow>
        <capsuleGeometry args={[girth, torsoHeight * 0.6, 4, 12]} />
        <meshStandardMaterial color={appearance.top} roughness={0.85} />
      </mesh>

      <group ref={armLeft} position={[-girth * 1.25, shoulderY * 0.97, 0]}>
        <mesh position={[0, -armLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.24, armLength * 0.75, 4, 8]} />
          <meshStandardMaterial color={appearance.top} roughness={0.85} />
        </mesh>
      </group>
      <group ref={armRight} position={[girth * 1.25, shoulderY * 0.97, 0]}>
        <mesh position={[0, -armLength / 2, 0]} castShadow>
          <capsuleGeometry args={[girth * 0.24, armLength * 0.75, 4, 8]} />
          <meshStandardMaterial color={appearance.top} roughness={0.85} />
        </mesh>
      </group>

      <mesh position={[0, shoulderY + headRadius * 1.35, 0]} castShadow>
        <sphereGeometry args={[headRadius, 16, 16]} />
        <meshStandardMaterial color={appearance.skin} roughness={0.75} />
      </mesh>

      {appearance.hairStyle !== 'bald' && (
        <mesh
          position={[0, shoulderY + headRadius * 1.36, 0]}
          castShadow
        >
          <sphereGeometry
            args={[
              headRadius * (appearance.hairStyle === 'medium' ? 1.1 : 1.04),
              16,
              16,
              0,
              Math.PI * 2,
              0,
              Math.PI / 2,
            ]}
          />
          <meshStandardMaterial color={appearance.hair} roughness={0.95} />
        </mesh>
      )}

      {appearance.facialHair !== 'none' && (
        <mesh
          position={[
            0,
            shoulderY + headRadius * (appearance.facialHair === 'moustache' ? 1.24 : 1.08),
            headRadius * 0.55,
          ]}
          castShadow
        >
          <boxGeometry
            args={[
              headRadius * 1.1,
              headRadius * (appearance.facialHair === 'beard' ? 1.0 : 0.28),
              headRadius * 0.5,
            ]}
          />
          <meshStandardMaterial
            color={appearance.hair}
            roughness={0.95}
            transparent={appearance.facialHair === 'stubble'}
            opacity={appearance.facialHair === 'stubble' ? 0.55 : 1}
          />
        </mesh>
      )}

      {appearance.glasses && (
        <mesh position={[0, shoulderY + headRadius * 1.4, headRadius * 0.82]}>
          <boxGeometry args={[headRadius * 1.7, headRadius * 0.34, headRadius * 0.1]} />
          <meshStandardMaterial color="#15181d" roughness={0.4} metalness={0.3} />
        </mesh>
      )}
    </group>
  )
}
```

- [ ] **Step 6: Реализовать привязку персонажа к симуляции**

Создать `src/render/character/PlayerCharacter.tsx`:

```tsx
import { useFrame } from '@react-three/fiber'
import { useRef, useState } from 'react'
import type { Group } from 'three'
import { isMoving } from '../../sim/actor/Actor'
import { useWorld } from '../useWorld'
import { createAppearance } from './CharacterAppearance'
import { ProceduralCharacter } from './ProceduralCharacter'

const PLAYER_LOOK = createAppearance({
  height: 1.78,
  top: '#4a5d7e',
  bottom: '#23262c',
  hairStyle: 'medium',
})

/**
 * Связывает актора из симуляции с его визуальным представлением.
 * Позиция читается напрямую из World каждый кадр, минуя состояние React,
 * иначе на ускоренном времени персонаж будет дёргаться.
 *
 * Признак ходьбы держится в состоянии — он меняется редко, только на
 * старте и остановке, так что перерисовки почти не случаются.
 */
export function PlayerCharacter() {
  const world = useWorld()
  const group = useRef<Group>(null)
  const [walking, setWalking] = useState(false)

  useFrame(() => {
    if (!group.current) return
    const { position, facing } = world.player
    group.current.position.set(position.x, 0, position.z)
    // Модель смотрит вдоль +Z, поэтому доворачиваем на четверть оборота.
    group.current.rotation.y = -facing + Math.PI / 2

    const moving = isMoving(world.player)
    setWalking((prev) => (prev === moving ? prev : moving))
  })

  return (
    <group ref={group}>
      <ProceduralCharacter appearance={PLAYER_LOOK} walking={walking} />
    </group>
  )
}
```

- [ ] **Step 7: Добавить персонажа в сцену**

В `src/render/GameCanvas.tsx` добавить импорт и расширить `Scene`:

```tsx
import { PlayerCharacter } from './character/PlayerCharacter'
```

```tsx
function Scene({ onSelectProp }: { onSelectProp: (propId: string) => void }) {
  const world = useWorld()
  return (
    <>
      <FloorMesh plan={world.plan} catalog={world.catalog} onSelectProp={onSelectProp} />
      <PlayerCharacter />
    </>
  )
}
```

- [ ] **Step 8: Проверить в браузере**

Run: `npm run dev`
Expected: посреди коридора у автоматов стоит человечек с головой, волосами, руками и ногами, ростом заметно ниже трёхметровой стены. Он неподвижен — ходить пока некуда.

- [ ] **Step 9: Проверить сборку и тесты**

Run: `npm run build && npm test`
Expected: успешно.

- [ ] **Step 10: Коммит**

```bash
git add src/render
git commit -m "feat: процедурный персонаж с параметрической внешностью"
```

---

### Task 13: Навигация кликом

**Files:**
- Create: `src/render/input/ClickToMove.tsx`
- Modify: `src/render/GameCanvas.tsx`

**Interfaces:**
- Consumes: `useWorld`.
- Produces: `function ClickToMove(): ReactElement` — прозрачная плоскость-приёмник кликов на уровне пола.

Плоскость должна оставаться **видимой** с точки зрения three.js (`visible` по умолчанию `true`) и быть прозрачной через материал: raycaster пропускает объекты с `visible === false`, и невидимая плоскость не поймала бы ни одного клика.

- [ ] **Step 1: Реализовать приёмник кликов**

Создать `src/render/input/ClickToMove.tsx`:

```tsx
import type { ThreeEvent } from '@react-three/fiber'
import { useWorld } from '../useWorld'

/**
 * Прозрачная плоскость на уровне пола. Ловит клики, переводит точку попадания
 * в клетку сетки и отдаёт команду симуляции. Если клетка непроходима,
 * симуляция сама отвергнет команду — здесь никакой логики нет.
 *
 * Плоскость прозрачна через материал, а не через visible={false}:
 * невидимые объекты three.js исключает из проверки пересечений.
 */
export function ClickToMove() {
  const world = useWorld()
  const width = world.grid.cols * world.grid.cellSize
  const depth = world.grid.rows * world.grid.cellSize

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation()
    world.commandMoveTo(world.grid.worldToGrid({ x: event.point.x, z: event.point.z }))
  }

  return (
    <mesh
      position={[width / 2, 0.02, depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={handleClick}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}
```

- [ ] **Step 2: Подключить в сцену**

В `src/render/GameCanvas.tsx` добавить импорт и вставить в `Scene` перед персонажем:

```tsx
import { ClickToMove } from './input/ClickToMove'
```

```tsx
function Scene({ onSelectProp }: { onSelectProp: (propId: string) => void }) {
  const world = useWorld()
  return (
    <>
      <FloorMesh plan={world.plan} catalog={world.catalog} onSelectProp={onSelectProp} />
      <ClickToMove />
      <PlayerCharacter />
    </>
  )
}
```

- [ ] **Step 3: Проверить в браузере**

Run: `npm run dev`
Expected: клик по полу — персонаж идёт туда, обходя стены и мебель, руки и ноги качаются при ходьбе. Клик по стене — персонаж стоит на месте. Клик внутри аудитории из коридора — персонаж проходит через дверной проём, а не сквозь стену. Клик в лифтовом холле — обходит блок туалетов по коридору.

- [ ] **Step 4: Проверить сборку**

Run: `npm run build && npm test`
Expected: успешно.

- [ ] **Step 5: Коммит**

```bash
git add src/render
git commit -m "feat: навигация персонажа кликом по полу"
```

---

### Task 14: Интерфейс — нужды, время, меню действий

**Files:**
- Create: `src/render/ui/hud.css`
- Create: `src/render/ui/NeedsPanel.tsx`
- Create: `src/render/ui/TimeControls.tsx`
- Create: `src/render/ui/InteractionMenu.tsx`
- Modify: `src/render/App.tsx`

**Interfaces:**
- Consumes: `useWorld`, `useWorldSnapshot`, `NEED_IDS`, `NEED_LABELS`, `needSatisfaction`, `Speed`, `World.commandInteract`.
- Produces: `function NeedsPanel()`, `function TimeControls()`, `function InteractionMenu({ propId, onClose })`.

- [ ] **Step 1: Создать стили интерфейса**

Создать `src/render/ui/hud.css`:

```css
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #e8e8ea;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.hud__panel {
  position: absolute;
  background: rgba(18, 21, 27, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 14px;
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.hud__needs { left: 16px; bottom: 16px; width: 230px; }
.hud__time { right: 16px; top: 16px; text-align: right; }

.need { margin-bottom: 8px; }
.need:last-child { margin-bottom: 0; }

.need__label {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 3px;
  opacity: 0.85;
}

.need__track {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.need__fill { height: 100%; border-radius: 3px; transition: width 120ms linear; }

.hud__clock { font-size: 26px; font-weight: 600; letter-spacing: 0.5px; }
.hud__day { font-size: 12px; opacity: 0.7; margin-bottom: 8px; }
.hud__mood { margin-top: 10px; font-size: 12px; opacity: 0.8; }

.speed-buttons { display: flex; gap: 6px; justify-content: flex-end; }

.speed-buttons button {
  width: 34px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #e8e8ea;
  font-size: 13px;
  cursor: pointer;
}

.speed-buttons button[data-active='true'] {
  background: #3d6ce0;
  border-color: #5c85ea;
}

.hud__menu {
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  min-width: 250px;
}

.hud__menu-title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.75;
  margin-bottom: 8px;
}

.hud__menu-item {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 9px 11px;
  margin-bottom: 5px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #e8e8ea;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.hud__menu-item:hover { background: rgba(61, 108, 224, 0.35); }
.hud__menu-item--cancel { opacity: 0.55; margin-bottom: 0; }
.hud__menu-time { opacity: 0.5; }

.hud__activity {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  font-size: 13px;
  background: rgba(18, 21, 27, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 7px 16px;
}
```

- [ ] **Step 2: Создать панель нужд**

Создать `src/render/ui/NeedsPanel.tsx`:

```tsx
import { NEED_IDS, NEED_LABELS, needSatisfaction } from '../../sim/needs/needs'
import { useWorldSnapshot } from '../useWorld'

function barColor(satisfaction: number): string {
  if (satisfaction > 60) return '#5cb974'
  if (satisfaction > 30) return '#d9a441'
  return '#d4574e'
}

function moodLabel(mood: number): string {
  if (mood > 80) return 'Отличное настроение'
  if (mood > 60) return 'Нормально'
  if (mood > 40) return 'Так себе'
  if (mood > 20) return 'Плохо'
  return 'Совсем скверно'
}

export function NeedsPanel() {
  const snapshot = useWorldSnapshot()

  return (
    <div className="hud__panel hud__needs">
      {NEED_IDS.map((id) => {
        const satisfaction = needSatisfaction(id, snapshot.needs[id])
        return (
          <div className="need" key={id}>
            <div className="need__label">
              <span>{NEED_LABELS[id]}</span>
              <span>{Math.round(satisfaction)}</span>
            </div>
            <div className="need__track">
              <div
                className="need__fill"
                style={{ width: `${satisfaction}%`, background: barColor(satisfaction) }}
              />
            </div>
          </div>
        )
      })}
      <div className="hud__mood">{moodLabel(snapshot.mood)}</div>
    </div>
  )
}
```

- [ ] **Step 3: Создать управление временем**

Создать `src/render/ui/TimeControls.tsx`:

```tsx
import type { Speed } from '../../sim/time/GameClock'
import { useWorld, useWorldSnapshot } from '../useWorld'

const SPEEDS: { value: Speed; label: string; title: string }[] = [
  { value: 0, label: '❚❚', title: 'Пауза' },
  { value: 1, label: '1×', title: 'Обычная скорость' },
  { value: 2, label: '2×', title: 'Быстро' },
  { value: 3, label: '3×', title: 'Очень быстро' },
]

export function TimeControls() {
  const world = useWorld()
  const snapshot = useWorldSnapshot()

  return (
    <div className="hud__panel hud__time">
      <div className="hud__clock">{snapshot.timeLabel}</div>
      <div className="hud__day">{snapshot.dayLabel}</div>
      <div className="speed-buttons">
        {SPEEDS.map((speed) => (
          <button
            key={speed.value}
            type="button"
            title={speed.title}
            data-active={snapshot.speed === speed.value}
            onClick={() => {
              world.clock.speed = speed.value
            }}
          >
            {speed.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Создать меню действий**

Создать `src/render/ui/InteractionMenu.tsx`:

```tsx
import { useWorld } from '../useWorld'

export function InteractionMenu({
  propId,
  onClose,
}: {
  propId: string | null
  onClose: () => void
}) {
  const world = useWorld()
  if (!propId) return null

  const placement = world.plan.props.find((p) => p.id === propId)
  const definition = placement ? world.catalog[placement.kind] : undefined
  if (!placement || !definition || definition.interactions.length === 0) return null

  return (
    <div className="hud__panel hud__menu">
      <div className="hud__menu-title">{definition.label}</div>
      {definition.interactions.map((interaction) => (
        <button
          key={interaction.id}
          type="button"
          className="hud__menu-item"
          onClick={() => {
            world.commandInteract(propId, interaction.id)
            onClose()
          }}
        >
          <span>{interaction.label}</span>
          <span className="hud__menu-time">{interaction.durationMinutes} мин</span>
        </button>
      ))}
      <button
        type="button"
        className="hud__menu-item hud__menu-item--cancel"
        onClick={onClose}
      >
        Отмена
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Собрать интерфейс в `App.tsx`**

Полностью заменить `src/render/App.tsx`:

```tsx
import { useState } from 'react'
import { GameCanvas } from './GameCanvas'
import './ui/hud.css'
import { InteractionMenu } from './ui/InteractionMenu'
import { NeedsPanel } from './ui/NeedsPanel'
import { TimeControls } from './ui/TimeControls'
import { useWorldSnapshot, WorldProvider } from './useWorld'

function ActivityLabel() {
  const snapshot = useWorldSnapshot()
  if (!snapshot.activity) return null
  return <div className="hud__activity">{snapshot.activity}</div>
}

function Hud({
  selectedProp,
  onCloseMenu,
}: {
  selectedProp: string | null
  onCloseMenu: () => void
}) {
  return (
    <div className="hud">
      <TimeControls />
      <NeedsPanel />
      <ActivityLabel />
      <InteractionMenu propId={selectedProp} onClose={onCloseMenu} />
    </div>
  )
}

export function App() {
  const [selectedProp, setSelectedProp] = useState<string | null>(null)

  return (
    <WorldProvider>
      <GameCanvas onSelectProp={setSelectedProp} />
      <Hud selectedProp={selectedProp} onCloseMenu={() => setSelectedProp(null)} />
    </WorldProvider>
  )
}
```

- [ ] **Step 6: Проверить в браузере**

Run: `npm run dev`
Expected:
- Слева внизу семь полосок нужд, они медленно убывают. У стресса подпись «Спокойствие», и его полоска тоже убывает — то есть спокойствие тает.
- Справа вверху часы от 07:00, подпись «Неделя 1, понедельник» и четыре кнопки скорости. Пауза останавливает часы, износ нужд и движение. На 3× всё идёт заметно быстрее.
- Клик по кофейному автомату открывает меню «Кофейный автомат → Взять кофе (6 мин)». После выбора персонаж идёт к автомату, внизу появляется плашка «Взять кофе», через несколько игровых минут плашка исчезает и Энергия заметно подрастает, а Мочевой пузырь просаживается.
- Клик по полу во время действия отменяет его — плашка пропадает.
- Клик по лифту предлагает «Ждать лифт (9 мин)», после выполнения падает Спокойствие.

- [ ] **Step 7: Проверить сборку и тесты**

Run: `npm run build && npm test`
Expected: обе команды успешны, все тесты зелёные.

- [ ] **Step 8: Коммит**

```bash
git add src/render
git commit -m "feat: интерфейс нужд, часов и меню действий"
```

---

## Что даёт этот этап

Работающая основа: этаж здания, сгенерированный из данных, изометрическая камера с вращением и зумом, персонаж, который ходит по клику и обходит препятствия, идущее игровое время с паузой и ускорением, семь нужд, которые убывают и восстанавливаются от осмысленных действий, и меню взаимодействия с предметами.

В это уже можно играть. Дальше наращивается контент и глубина.

## Следующие этапы (планируются отдельно)

- **Этап 2 — жизнь вокруг:** остальные этажи, лестница и лифт как переходы между ними, автономные NPC с utility-AI и расписанием, фоновые разговоры пузырями.
- **Этап 3 — учёба:** курсы, расписание пар, лекции и семинары, эссе, накопленная оценка, экзамены, шесть преподавателей с внешностью и характером.
- **Этап 4 — люди:** диалоговая система, отношения по двум измерениям, шкала философских фракций, навыки, модификаторы настроения.
- **Этап 5 — рамка:** общага и суточный цикл, выходные карточкой, сессия, эпилоги, сохранения, процедурный звук.
