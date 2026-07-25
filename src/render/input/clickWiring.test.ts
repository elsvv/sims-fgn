import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Сторож общего правила: клик по объекту сцены признаётся кликом только
 * через `dragAwareClick`.
 *
 * Проверка нужна именно как проверка исходников. Дефект «камера не
 * вращается» жил ровно в том, что каждый кликабельный объект заводил
 * обработчик сам по себе, и общего места, где это можно было бы починить
 * один раз, не было. Стоит завести следующий объект по старому образцу —
 * и половина сцены снова уводит персонажа посреди поворота вида.
 */

const RENDER_DIR = join(process.cwd(), 'src', 'render')
const UI_DIR = join(RENDER_DIR, 'ui')

/**
 * Файлы трёхмерной сцены. Панели интерфейса из src/render/ui — обычный DOM:
 * там onClick висит на кнопках, к камере отношения не имеет.
 */
function sceneSources(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (full === UI_DIR) continue
    if (statSync(full).isDirectory()) {
      found.push(...sceneSources(full))
    } else if (entry.endsWith('.tsx')) {
      found.push(full)
    }
  }
  return found
}

function read(file: string): string {
  return readFileSync(file, 'utf8')
}

const SCENE_FILES = sceneSources(RENDER_DIR)
const CLICK_HANDLER = /onClick\s*=\s*\{\s*([A-Za-z_$][\w$]*)/g

describe('клики по сцене заведены одинаково', () => {
  it('в сцене вообще есть файлы и есть клики', () => {
    expect(SCENE_FILES.length).toBeGreaterThan(0)
    const withClicks = SCENE_FILES.filter((file) => /onClick\s*=/.test(read(file)))
    expect(withClicks.length, 'кликабельных объектов сцены не нашлось').toBeGreaterThanOrEqual(3)
  })

  it('каждый обработчик клика обёрнут в dragAwareClick', () => {
    const violations: string[] = []
    for (const file of SCENE_FILES) {
      const source = read(file)
      for (const match of source.matchAll(CLICK_HANDLER)) {
        if (match[1] !== 'dragAwareClick') {
          violations.push(`${relative(process.cwd(), file)}: onClick={${match[1]}…}`)
        }
      }
    }
    expect(violations, 'клик мимо общей обёртки: вращение камеры снова станет кликом').toEqual([])
  })

  it('файлы с кликами берут обёртку из общего места', () => {
    const violations: string[] = []
    for (const file of SCENE_FILES) {
      const source = read(file)
      if (!/onClick\s*=/.test(source)) continue
      if (!/import\s*\{[^}]*dragAwareClick[^}]*\}\s*from\s*'[^']*sceneClicks'/.test(source)) {
        violations.push(relative(process.cwd(), file))
      }
    }
    expect(violations).toEqual([])
  })

  it('наблюдение за мышью ставится в корне приложения', () => {
    // Без этого вызова учёт нажатий пуст, и обёртка пропускает всё подряд.
    expect(read(join(RENDER_DIR, 'App.tsx'))).toMatch(/usePointerGestures\(\)/)
  })
})

describe('интерфейс не пропускает нажатия в сцену', () => {
  const css = readFileSync(join(RENDER_DIR, 'ui', 'hud.css'), 'utf8')

  function block(selector: string): string {
    const found = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
    expect(found, `в hud.css нет правила ${selector}`).not.toBeNull()
    return found?.[1] ?? ''
  }

  it('слой интерфейса сам по себе прозрачен для мыши', () => {
    expect(block('.hud')).toMatch(/pointer-events:\s*none/)
  })

  it('панель ловит нажатие на себя и не пускает его в пол под собой', () => {
    expect(block('.hud__panel')).toMatch(/pointer-events:\s*auto/)
  })
})
