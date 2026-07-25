import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLOOR_A2 } from '../floors/floorA2'
import {
  fitPropModel,
  fittedBounds,
  isUsableBounds,
  type ModelBounds,
} from '../../sim/world/fitPropModel'
import type { PropModel } from '../../sim/world/PropDefinition'
import { PROP_CATALOG } from './propCatalog'

/**
 * Проверки моделей обстановки.
 *
 * Половина из них читает настоящие файлы GLB и считает их настоящие
 * габариты. Это нарочно: подгонку размера и посадку на пол невозможно
 * проверить на выдуманных числах — ломается она именно от того, что
 * у конкретной модели свой масштаб и своё начало координат.
 */

const PUBLIC_DIR = join(process.cwd(), 'public')
const MODELS_DIR = join(PUBLIC_DIR, 'models', 'props')
const URL_PREFIX = '/models/props/'

const DEFINITIONS = Object.values(PROP_CATALOG)

function modelsOf(): { kind: string; model: PropModel }[] {
  const found: { kind: string; model: PropModel }[] = []
  for (const definition of DEFINITIONS) {
    const model = definition.model
    if (model && model !== 'box') found.push({ kind: definition.kind, model })
  }
  return found
}

const MODELS = modelsOf()

/* ---------------------------------------------------------------------- *
 * Чтение габарита прямо из файла GLB.
 *
 * Своё, без three.js: в тестовой среде нет ни WebGL, ни DOM, а нужен
 * ответ на один вопрос — какой на самом деле у модели габарит. Разбор
 * идёт по спецификации glTF 2.0: заголовок, чанк JSON, обход узлов сцены
 * с перемножением матриц, восемь углов габарита каждого примитива.
 * ---------------------------------------------------------------------- */

type Matrix = number[]

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

interface GlbNode {
  mesh?: number
  children?: number[]
  matrix?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}

interface GlbJson {
  scene?: number
  scenes: { nodes: number[] }[]
  nodes: GlbNode[]
  meshes: { primitives: { attributes: { POSITION: number } }[] }[]
  accessors: { min?: number[]; max?: number[] }[]
}

/** Умножение матриц 4×4, столбцы подряд — как в glTF. */
function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Array<number>(16).fill(0)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0)
      out[column * 4 + row] = sum
    }
  }
  return out
}

function nodeMatrix(node: GlbNode): Matrix {
  if (node.matrix) return node.matrix.slice()
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const x2 = (x ?? 0) * 2
  const y2 = (y ?? 0) * 2
  const z2 = (z ?? 0) * 2
  const xx = (x ?? 0) * x2
  const xy = (x ?? 0) * y2
  const xz = (x ?? 0) * z2
  const yy = (y ?? 0) * y2
  const yz = (y ?? 0) * z2
  const zz = (z ?? 0) * z2
  const wx = (w ?? 1) * x2
  const wy = (w ?? 1) * y2
  const wz = (w ?? 1) * z2
  return [
    (1 - (yy + zz)) * (sx ?? 1),
    (xy + wz) * (sx ?? 1),
    (xz - wy) * (sx ?? 1),
    0,
    (xy - wz) * (sy ?? 1),
    (1 - (xx + zz)) * (sy ?? 1),
    (yz + wx) * (sy ?? 1),
    0,
    (xz + wy) * (sz ?? 1),
    (yz - wx) * (sz ?? 1),
    (1 - (xx + yy)) * (sz ?? 1),
    0,
    tx ?? 0,
    ty ?? 0,
    tz ?? 0,
    1,
  ]
}

function transformPoint(m: Matrix, p: number[]): number[] {
  const [x = 0, y = 0, z = 0] = p
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0),
  ]
}

/** Разбор контейнера GLB: заголовок, длина, чанк JSON. */
function readGlbJson(file: string): GlbJson {
  const buffer = readFileSync(file)
  expect(buffer.readUInt32LE(0), `${file}: не похоже на GLB`).toBe(0x46546c67)
  expect(buffer.readUInt32LE(4), `${file}: не вторая версия glTF`).toBe(2)
  expect(buffer.readUInt32LE(8), `${file}: длина в заголовке не сходится`).toBe(buffer.length)

  const chunkLength = buffer.readUInt32LE(12)
  expect(buffer.readUInt32LE(16), `${file}: первый чанк не JSON`).toBe(0x4e4f534a)
  return JSON.parse(buffer.subarray(20, 20 + chunkLength).toString('utf8')) as GlbJson
}

/** Настоящий габарит модели в её собственных единицах. */
function readModelBounds(file: string): ModelBounds {
  const json = readGlbJson(file)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  const walk = (index: number, parent: Matrix): void => {
    const node = json.nodes[index]
    if (!node) return
    const world = multiply(parent, nodeMatrix(node))

    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh]?.primitives ?? []) {
        const accessor = json.accessors[primitive.attributes.POSITION]
        if (!accessor?.min || !accessor.max) continue
        for (let corner = 0; corner < 8; corner++) {
          const point = [
            corner & 1 ? accessor.max[0] : accessor.min[0],
            corner & 2 ? accessor.max[1] : accessor.min[1],
            corner & 4 ? accessor.max[2] : accessor.min[2],
          ].map((value) => value ?? 0)
          const world3 = transformPoint(world, point)
          for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis] ?? Infinity, world3[axis] ?? 0)
            max[axis] = Math.max(max[axis] ?? -Infinity, world3[axis] ?? 0)
          }
        }
      }
    }

    for (const child of node.children ?? []) walk(child, world)
  }

  const scene = json.scenes[json.scene ?? 0]
  for (const root of scene?.nodes ?? []) walk(root, IDENTITY)

  return {
    min: { x: min[0] ?? 0, y: min[1] ?? 0, z: min[2] ?? 0 },
    max: { x: max[0] ?? 0, y: max[1] ?? 0, z: max[2] ?? 0 },
  }
}

function fileOf(model: PropModel): string {
  return join(MODELS_DIR, model.url.slice(URL_PREFIX.length))
}

describe('каждый предмет знает, чем он рисуется', () => {
  it('в каталоге вообще есть предметы', () => {
    expect(DEFINITIONS.length).toBeGreaterThan(0)
  })

  it('у каждого предмета либо модель, либо явное «рисуется боксом»', () => {
    // Незаполненное поле не отличить от осознанного решения рисовать
    // предмет боксом. Поэтому решение должно быть названо вслух.
    const silent = DEFINITIONS.filter((definition) => definition.model === undefined)
    expect(silent.map((definition) => definition.kind)).toEqual([])
  })

  it('большая часть каталога рисуется моделями, а не боксами', () => {
    expect(MODELS.length).toBeGreaterThanOrEqual(DEFINITIONS.length - 1)
  })
})

describe('файлы моделей на месте', () => {
  it('путь модели ведёт в /models/props и оканчивается на .glb', () => {
    for (const { kind, model } of MODELS) {
      expect(model.url.startsWith(URL_PREFIX), `${kind}: ${model.url}`).toBe(true)
      expect(model.url.endsWith('.glb'), `${kind}: ${model.url}`).toBe(true)
    }
  })

  it('каждый файл действительно лежит в public', () => {
    for (const { kind, model } of MODELS) {
      expect(existsSync(fileOf(model)), `${kind}: нет файла ${model.url}`).toBe(true)
    }
  })

  it('в public/models/props нет ничего лишнего', () => {
    // Вес браузерной сборки: в игру кладём только то, что игра грузит.
    const used = new Set(MODELS.map(({ model }) => model.url.slice(URL_PREFIX.length)))
    const lying = readdirSync(MODELS_DIR).filter((name) => !used.has(name))
    expect(lying, 'лишние модели в сборке').toEqual([])
  })

  it('рядом с моделями лежат лицензионные сведения', () => {
    const license = join(PUBLIC_DIR, 'models', 'LICENSE.md')
    expect(existsSync(license)).toBe(true)
    const text = readFileSync(license, 'utf8')
    expect(text).toMatch(/CC0/)
    expect(text).toMatch(/Kenney/)
    expect(text).toMatch(/kenney\.nl/)
  })

  it('все файлы вместе весят немного', () => {
    // Браузерная игра: обстановка не должна стоить дороже, чем весит
    // весь остальной код. Полтора мегабайта — потолок с большим запасом.
    const total = readdirSync(MODELS_DIR).reduce(
      (sum, name) => sum + readFileSync(join(MODELS_DIR, name)).length,
      0,
    )
    expect(total).toBeLessThan(1_500_000)
  })
})

describe('модель садится в клетку по настоящим габаритам файла', () => {
  const cellSize = FLOOR_A2.cellSize

  it('габарит каждого файла читается и годится для подгонки', () => {
    for (const { kind, model } of MODELS) {
      const bounds = readModelBounds(fileOf(model))
      expect(isUsableBounds(bounds), `${kind}: пустой или вывернутый габарит`).toBe(true)
    }
  })

  it('ни одна модель не выходит за свою клетку', () => {
    for (const { kind, model } of MODELS) {
      const definition = PROP_CATALOG[kind]!
      const bounds = readModelBounds(fileOf(model))
      const box = fittedBounds(
        bounds,
        fitPropModel({ bounds, size: definition.size, model, cellSize }),
      )
      expect(box.max.x - box.min.x, `${kind}: ширина`).toBeLessThanOrEqual(cellSize + 1e-6)
      expect(box.max.z - box.min.z, `${kind}: глубина`).toBeLessThanOrEqual(cellSize + 1e-6)
      expect(box.min.x, `${kind}: вылезает за левый край клетки`).toBeGreaterThanOrEqual(
        -cellSize / 2 - 1e-6,
      )
      expect(box.max.x, `${kind}: вылезает за правый край клетки`).toBeLessThanOrEqual(
        cellSize / 2 + 1e-6,
      )
      expect(box.min.z, `${kind}: вылезает за дальний край клетки`).toBeGreaterThanOrEqual(
        -cellSize / 2 - 1e-6,
      )
      expect(box.max.z, `${kind}: вылезает за ближний край клетки`).toBeLessThanOrEqual(
        cellSize / 2 + 1e-6,
      )
    }
  })

  it('ни одна модель не проваливается под пол и не парит без причины', () => {
    for (const { kind, model } of MODELS) {
      const definition = PROP_CATALOG[kind]!
      const bounds = readModelBounds(fileOf(model))
      const box = fittedBounds(
        bounds,
        fitPropModel({ bounds, size: definition.size, model, cellSize }),
      )
      // Ноль — пол. Поднять предмет над полом может только явный сдвиг
      // в данных: так висят на стене доска и доска объявлений.
      expect(box.min.y, `${kind}: провалился под пол`).toBeGreaterThanOrEqual(-1e-6)
      expect(box.min.y, `${kind}: парит в воздухе`).toBeCloseTo(model.offset?.y ?? 0, 6)
    }
  })

  it('модель заполняет объявленный габарит, а не теряется в нём', () => {
    // Предмет, вписанный с большим запасом, выглядит игрушечным рядом
    // с человеком ростом 1.78. Три четверти высоты — нижняя граница
    // приличия для `contain`.
    for (const { kind, model } of MODELS) {
      const definition = PROP_CATALOG[kind]!
      const bounds = readModelBounds(fileOf(model))
      const box = fittedBounds(
        bounds,
        fitPropModel({ bounds, size: definition.size, model, cellSize }),
      )
      const height = box.max.y - box.min.y
      expect(height / definition.size.h, `${kind}: высота`).toBeGreaterThan(0.75)
    }
  })

  it('прижатый к стене предмет упирается в дальний край клетки', () => {
    for (const { kind, model } of MODELS) {
      if (model.align !== 'back') continue
      const definition = PROP_CATALOG[kind]!
      const bounds = readModelBounds(fileOf(model))
      const box = fittedBounds(
        bounds,
        fitPropModel({ bounds, size: definition.size, model, cellSize }),
      )
      expect(box.min.z, `${kind}: не дотянулся до стены`).toBeCloseTo(-cellSize / 2, 6)
    }
  })
})

describe('данные подгонки осмысленны', () => {
  it('множитель масштаба положителен', () => {
    for (const { kind, model } of MODELS) {
      if (model.scale === undefined) continue
      expect(model.scale, kind).toBeGreaterThan(0)
    }
  })

  it('поправка поворота кратна четверти оборота', () => {
    // Планировка стоит по сторонам света, косых предметов в ней нет.
    for (const { kind, model } of MODELS) {
      const offset = model.rotationOffset ?? 0
      const quarters = offset / (Math.PI / 2)
      expect(Math.abs(quarters - Math.round(quarters)), kind).toBeLessThan(1e-9)
    }
  })

  it('развёрнутый на четверть оборота предмет остаётся квадратным в плане', () => {
    // Поправка поворота меняет местами ширину и глубину. Если они разные,
    // предмет вылезет из клетки — ровно та ошибка, которую невозможно
    // заметить глазом на одном этаже и которая всплывёт на следующем.
    for (const { kind, model } of MODELS) {
      const quarters = Math.round((model.rotationOffset ?? 0) / (Math.PI / 2))
      if (quarters % 2 === 0) continue
      const { w, d } = PROP_CATALOG[kind]!.size
      expect(w, `${kind}: ширина и глубина должны совпадать`).toBeCloseTo(d, 9)
    }
  })

  it('сдвиг по высоте бывает только у того, что висит на стене', () => {
    // Предмет, поднятый над полом «просто так», — это дефект, который
    // на картинке выглядит как парящий в воздухе шкаф.
    const hanging = new Set(['whiteboard', 'noticeBoard'])
    for (const { kind, model } of MODELS) {
      const lift = model.offset?.y ?? 0
      if (lift === 0) continue
      expect(hanging.has(kind), `${kind}: поднят над полом без причины`).toBe(true)
      expect(lift, `${kind}: высота подвеса`).toBeGreaterThan(0.5)
      expect(lift, `${kind}: высота подвеса`).toBeLessThan(1.2)
    }
  })
})
