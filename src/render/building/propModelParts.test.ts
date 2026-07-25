import { BoxGeometry, Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { PropPlacement } from '../../sim/world/FloorPlan'
import { fitPropModel } from '../../sim/world/fitPropModel'
import type { PropModel } from '../../sim/world/PropDefinition'
import {
  buildPropParts,
  collectMeshes,
  dominantMaterial,
  modelBounds,
  ownedMaterials,
  propInstanceMatrix,
  propPlacementMatrix,
} from './propModelParts'

/**
 * Модель-заглушка: большой корпус одного материала и маленькая ручка
 * другого. Ровно то устройство, что у моделей Kenney, и ровно тот случай,
 * ради которого перекрашивается не всё подряд, а главный материал.
 */
function makeModel(): { root: Object3D; body: MeshStandardMaterial; handle: MeshStandardMaterial } {
  const body = new MeshStandardMaterial({ color: '#ffffff', name: 'корпус' })
  const handle = new MeshStandardMaterial({ color: '#111111', name: 'ручка' })

  const root = new Object3D()
  const bodyMesh = new Mesh(new BoxGeometry(2, 2, 2), body)
  bodyMesh.position.set(0, 1, 0)
  const handleMesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), handle)
  handleMesh.position.set(1, 1.5, 0)

  root.add(bodyMesh)
  root.add(handleMesh)
  return { root, body, handle }
}

const MODEL: PropModel = { url: '/models/props/test.glb', fit: 'stretch' }

describe('разбор загруженной модели', () => {
  it('габарит считается по всей сцене, а не по первому мешу', () => {
    const { root } = makeModel()
    const bounds = modelBounds(root)
    expect(bounds.min.x).toBeCloseTo(-1, 6)
    expect(bounds.max.x).toBeCloseTo(1.1, 6)
    expect(bounds.min.y).toBeCloseTo(0, 6)
    expect(bounds.max.y).toBeCloseTo(2, 6)
  })

  it('габарит учитывает смещение узлов внутри модели', () => {
    // Начало координат модели может стоять где угодно: у четырёх моделей
    // набора оно не в основании. Считать надо по треугольникам.
    const root = new Object3D()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    mesh.position.set(0, -3, 0)
    root.add(mesh)
    expect(modelBounds(root).min.y).toBeCloseTo(-3.5, 6)
  })

  it('находятся все меши сцены', () => {
    expect(collectMeshes(makeModel().root)).toHaveLength(2)
  })

  it('главным считается материал с наибольшим числом треугольников', () => {
    const { root, body } = makeModel()
    expect(dominantMaterial(collectMeshes(root))).toBe(body)
  })

  it('у сцены без мешей главного материала нет', () => {
    expect(dominantMaterial([])).toBeNull()
  })
})

describe('сборка кусков модели', () => {
  const size = { w: 1, d: 1, h: 1 }

  function build(tint: 'none' | 'dominant' | 'all') {
    const { root, body, handle } = makeModel()
    const bounds = modelBounds(root)
    const transform = fitPropModel({ bounds, size, model: MODEL, cellSize: 1 })
    const parts = buildPropParts({ root, transform, tint, color: '#2b3a2f' })
    return { parts, body, handle }
  }

  it('каждый меш даёт свой кусок', () => {
    expect(build('dominant').parts).toHaveLength(2)
  })

  it('материалы всегда клонируются, а не красятся на месте', () => {
    // GLTFLoader отдаёт один и тот же материал всем, кто загрузил файл.
    // Покрасить его на месте — значит перекрасить и доску объявлений,
    // и доску в аудитории, и всё, что грузит тот же файл.
    const { parts, body, handle } = build('dominant')
    for (const part of parts) {
      expect(part.material).not.toBe(body)
      expect(part.material).not.toBe(handle)
    }
    expect(body.color.getHexString()).toBe('ffffff')
  })

  it('перекрашивается только главный материал', () => {
    const { parts } = build('dominant')
    const colors = parts.map((part) =>
      (part.material as MeshStandardMaterial).color.getHexString(),
    )
    expect(colors).toContain(new Color('#2b3a2f').getHexString())
    expect(colors).toContain('111111')
  })

  it('tint: all красит всё', () => {
    const { parts } = build('all')
    const wanted = new Color('#2b3a2f').getHexString()
    for (const part of parts) {
      expect((part.material as MeshStandardMaterial).color.getHexString()).toBe(wanted)
    }
  })

  it('tint: none оставляет цвета автора', () => {
    const { parts } = build('none')
    const colors = parts.map((part) =>
      (part.material as MeshStandardMaterial).color.getHexString(),
    )
    expect(colors.sort()).toEqual(['111111', 'ffffff'])
  })

  it('один и тот же материал клонируется один раз на предмет', () => {
    const root = new Object3D()
    const shared = new MeshStandardMaterial({ color: '#ffffff' })
    for (let i = 0; i < 3; i++) {
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), shared)
      mesh.position.set(i, 0.5, 0)
      root.add(mesh)
    }
    const bounds = modelBounds(root)
    const parts = buildPropParts({
      root,
      transform: fitPropModel({ bounds, size, model: MODEL, cellSize: 1 }),
      tint: 'dominant',
      color: '#ff0000',
    })
    expect(parts).toHaveLength(3)
    expect(ownedMaterials(parts)).toHaveLength(1)
  })

  it('геометрия не копируется: она общая на все экземпляры', () => {
    const { root } = makeModel()
    const meshes = collectMeshes(root)
    const bounds = modelBounds(root)
    const parts = buildPropParts({
      root,
      transform: fitPropModel({ bounds, size, model: MODEL, cellSize: 1 }),
      tint: 'dominant',
      color: '#ff0000',
    })
    expect(parts.map((part) => part.geometry)).toEqual(meshes.map((mesh) => mesh.geometry))
  })

  it('куски встают на пол и в габарит предмета', () => {
    const { root } = makeModel()
    const bounds = modelBounds(root)
    const parts = buildPropParts({
      root,
      transform: fitPropModel({ bounds, size, model: MODEL, cellSize: 1 }),
      tint: 'dominant',
      color: '#ff0000',
    })
    // Нижняя точка корпуса после подгонки — это пол клетки.
    const corner = new Vector3(-1, -1, -1).applyMatrix4(parts[0]!.matrix)
    expect(corner.y).toBeCloseTo(0, 9)
  })
})

describe('место экземпляра на этаже', () => {
  function placement(col: number, row: number, rotation: number): PropPlacement {
    return { id: 'p', kind: 'k', col, row, rotation, blocks: true }
  }

  it('предмет встаёт в центр своей клетки', () => {
    const matrix = propPlacementMatrix(placement(3, 5, 0), 1, 0)
    const point = new Vector3(0, 0, 0).applyMatrix4(matrix)
    expect(point.x).toBeCloseTo(3.5, 9)
    expect(point.z).toBeCloseTo(5.5, 9)
  })

  it('размер клетки учитывается', () => {
    const point = new Vector3(0, 0, 0).applyMatrix4(propPlacementMatrix(placement(2, 2, 0), 2, 0))
    expect(point.x).toBeCloseTo(5, 9)
    expect(point.z).toBeCloseTo(5, 9)
  })

  it('поворот размещения разворачивает предмет вокруг центра клетки', () => {
    // Пол-оборота: то, что смотрело в +Z, смотрит в −Z, а клетка та же.
    const matrix = propPlacementMatrix(placement(0, 0, Math.PI), 1, 0)
    const front = new Vector3(0, 0, 1).applyMatrix4(matrix)
    expect(front.x).toBeCloseTo(0.5, 9)
    expect(front.z).toBeCloseTo(-0.5, 9)
  })

  it('поправка модели складывается с поворотом размещения', () => {
    const both = propPlacementMatrix(placement(0, 0, Math.PI / 2), 1, Math.PI / 2)
    const same = propPlacementMatrix(placement(0, 0, Math.PI), 1, 0)
    expect(both.elements).toEqual(same.elements)
  })

  it('поправка модели разворачивает модель, не трогая планировку', () => {
    // Лестница: её подъём идёт вдоль X, а планировка ждёт +Z.
    const matrix = propPlacementMatrix(placement(0, 0, 0), 1, -Math.PI / 2)
    const along = new Vector3(1, 0, 0).applyMatrix4(matrix)
    expect(along.x).toBeCloseTo(0.5, 9)
    expect(along.z).toBeCloseTo(1.5, 9)
  })

  it('матрица экземпляра — это место на этаже поверх посадки в клетку', () => {
    const { root } = makeModel()
    const bounds = modelBounds(root)
    const size = { w: 1, d: 1, h: 1 }
    const parts = buildPropParts({
      root,
      transform: fitPropModel({ bounds, size, model: MODEL, cellSize: 1 }),
      tint: 'none',
      color: '#ffffff',
    })
    const matrix = propInstanceMatrix(parts[0]!, placement(4, 6, 0), 1, MODEL)
    const bottom = new Vector3(-1, -1, -1).applyMatrix4(matrix)
    expect(bottom.y, 'экземпляр обязан стоять на полу').toBeCloseTo(0, 9)
    expect(bottom.x, 'экземпляр обязан стоять в своей клетке').toBeCloseTo(4, 9)
    expect(bottom.z).toBeCloseTo(6, 9)
  })
})
