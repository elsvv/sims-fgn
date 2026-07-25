import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = join(process.cwd(), 'src')
const SIM_DIR = join(SRC_DIR, 'sim')
const CONTENT_DIR = join(SRC_DIR, 'content')
const SHARED_DIR = join(SRC_DIR, 'shared')
const FORBIDDEN = [
  'react',
  'react-dom',
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  'zustand',
]

/**
 * Начало любой формы связывания модулей: `from 'x'`, побочный `import 'x'`,
 * динамический `import('x')` и `require('x')`. Проверять только `from`
 * недостаточно: побочный импорт тянет за собой ровно тот же пакет.
 */
const BINDING = String.raw`(?:from|import|require)\s*\(?\s*['"]`

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Пакет целиком: `react` не должен ловиться на `react-dom` и наоборот. */
function forbiddenPattern(pkg: string): RegExp {
  return new RegExp(`${BINDING}${escapeForRegExp(pkg)}(?:['"]|/)`)
}

/** Любой путь, ведущий в src/content, в том числе `../content` без слэша на конце. */
const CONTENT_PATTERN = new RegExp(`${BINDING}(?:[^'"]*/)?content(?:['"]|/)`)

/** Любой путь, ведущий в src/render. `./renderer` под это нарочно не подходит. */
const RENDER_PATTERN = new RegExp(`${BINDING}(?:[^'"]*/)?render(?:['"]|/)`)

/**
 * Все исходники слоя, кроме тестов. Расширение .tsx тоже считается: слой,
 * в котором его сегодня нет, завтра может им обзавестись, и проверка не
 * должна об этом молчать.
 */
function collectSourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full))
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.test.tsx')
    ) {
      found.push(full)
    }
  }
  return found
}

/** Файлы слоя, в которых сработал образец запрещённого импорта. */
function importsMatching(dir: string, pattern: RegExp): string[] {
  return collectSourceFiles(dir).filter((file) => pattern.test(readFileSync(file, 'utf8')))
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
        if (forbiddenPattern(pkg).test(source)) violations.push(`${file} импортирует ${pkg}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('src/sim не зависит от src/content', () => {
    const violations: string[] = []
    for (const file of collectSourceFiles(SIM_DIR)) {
      const source = readFileSync(file, 'utf8')
      if (CONTENT_PATTERN.test(source)) {
        violations.push(`${file} импортирует данные из content`)
      }
    }
    expect(violations).toEqual([])
  })

  /*
   * Стрелки зависимостей идут в одну сторону: render → content → sim,
   * и оба верхних слоя опираются на src/shared. Обратных стрелок нет
   * ни одной, и сторожить надо каждую: незамеченная обратная стрелка
   * не ломает сборку, а тихо превращает слои в один большой ком.
   */

  it('в src/content есть исходные файлы', () => {
    expect(collectSourceFiles(CONTENT_DIR).length).toBeGreaterThan(0)
  })

  it('src/content не зависит от src/render', () => {
    expect(importsMatching(CONTENT_DIR, RENDER_PATTERN)).toEqual([])
  })

  it('src/content не зависит от рендерящих пакетов', () => {
    const violations: string[] = []
    for (const file of collectSourceFiles(CONTENT_DIR)) {
      const source = readFileSync(file, 'utf8')
      for (const pkg of FORBIDDEN) {
        if (forbiddenPattern(pkg).test(source)) violations.push(`${file} импортирует ${pkg}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('в src/shared есть исходные файлы', () => {
    expect(collectSourceFiles(SHARED_DIR).length).toBeGreaterThan(0)
  })

  it('src/shared не зависит ни от кого сверху', () => {
    expect(importsMatching(SHARED_DIR, RENDER_PATTERN)).toEqual([])
    expect(importsMatching(SHARED_DIR, CONTENT_PATTERN)).toEqual([])
  })

  it('запрещённые пакеты опознаются во всех формах импорта', () => {
    const samples = [
      "import { useState } from 'react'",
      "import 'three'",
      "const { Canvas } = await import('@react-three/fiber')",
      "const three = require('three')",
      'import ReactDOM from "react-dom/client"',
    ]
    for (const sample of samples) {
      expect(
        FORBIDDEN.some((pkg) => forbiddenPattern(pkg).test(sample)),
        sample,
      ).toBe(true)
    }
  })

  it('пути в content опознаются во всех формах импорта', () => {
    const samples = [
      "import { PROP_CATALOG } from '../content/props/propCatalog'",
      "export * from '../../content'",
      "await import('./content/floors/floorA2')",
      "require('../content')",
    ]
    for (const sample of samples) {
      expect(CONTENT_PATTERN.test(sample), sample).toBe(true)
    }
  })

  it('пути в render опознаются во всех формах импорта', () => {
    const samples = [
      "import { TEACHERS } from '../render/character/NpcCharacters'",
      "export * from '../../render'",
      "await import('./render/ui/DialoguePanel')",
      "require('../render')",
    ]
    for (const sample of samples) {
      expect(RENDER_PATTERN.test(sample), sample).toBe(true)
    }
  })

  it('похожие, но безобидные имена не считаются нарушением', () => {
    const samples = [
      "import { vec2 } from './types'",
      "import { reactor } from './reactor'",
      "import { contentOf } from './mycontent-utils'",
      "import { renderer } from './renderer'",
      "import { render } from './rendered-text'",
    ]
    for (const sample of samples) {
      expect(
        FORBIDDEN.some((pkg) => forbiddenPattern(pkg).test(sample)) ||
          CONTENT_PATTERN.test(sample) ||
          RENDER_PATTERN.test(sample),
        sample,
      ).toBe(false)
    }
  })
})
