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
