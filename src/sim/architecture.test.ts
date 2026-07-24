import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SIM_DIR = join(process.cwd(), 'src', 'sim')
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

  it('похожие, но безобидные имена не считаются нарушением', () => {
    const samples = [
      "import { vec2 } from './types'",
      "import { reactor } from './reactor'",
      "import { contentOf } from './mycontent-utils'",
    ]
    for (const sample of samples) {
      expect(
        FORBIDDEN.some((pkg) => forbiddenPattern(pkg).test(sample)) ||
          CONTENT_PATTERN.test(sample),
        sample,
      ).toBe(false)
    }
  })
})
