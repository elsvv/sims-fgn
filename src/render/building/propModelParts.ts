import {
  Box3,
  Color,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three'
import type { PropPlacement } from '../../sim/world/FloorPlan'
import type { ModelBounds, PropModelTransform } from '../../sim/world/fitPropModel'
import type { PropModel, PropModelTint } from '../../sim/world/PropDefinition'

/**
 * Кусок модели, готовый к отрисовке: геометрия, свой материал и матрица
 * относительно центра клетки — до поворота размещения.
 *
 * Модель разбирается на куски по одной причине: инстансинг работает
 * с парой «геометрия + материал», а не с деревом объектов. Двадцать парт
 * на этаже — это два вызова отрисовки (дерево и металл), а не двадцать.
 */
export interface PropPart {
  geometry: BufferGeometry
  material: Material
  matrix: Matrix4
}

/** Габарит модели в её собственных единицах. */
export function modelBounds(root: Object3D): ModelBounds {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  }
}

/** Все меши сцены модели, в порядке обхода. */
export function collectMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (object instanceof Mesh && object.geometry) meshes.push(object)
  })
  return meshes
}

/** Материал меша. Массив материалов у набора Kenney не встречается, но код не должен на нём падать. */
function materialOf(mesh: Mesh): Material | null {
  const material = mesh.material
  if (Array.isArray(material)) return material[0] ?? null
  return material ?? null
}

function triangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex()
  if (index) return index.count / 3
  const position = geometry.getAttribute('position')
  return position ? position.count / 3 : 0
}

/**
 * Материал, на который приходится больше всего треугольников.
 *
 * Именно его перекраска даёт предмету нужный цвет: у моделей набора
 * один материал занимает почти всю поверхность, а остальные — ручки,
 * стекло, тёмную столешницу. Перекрась всё — и предмет станет плоским
 * силуэтом одного тона.
 */
export function dominantMaterial(meshes: readonly Mesh[]): Material | null {
  const weights = new Map<Material, number>()
  for (const mesh of meshes) {
    const material = materialOf(mesh)
    if (!material) continue
    weights.set(material, (weights.get(material) ?? 0) + triangleCount(mesh.geometry))
  }

  let best: Material | null = null
  let bestWeight = -1
  for (const [material, weight] of weights) {
    if (weight > bestWeight) {
      best = material
      bestWeight = weight
    }
  }
  return best
}

/** Есть ли у материала цвет, который можно поменять. */
function isColorable(material: Material): material is Material & { color: Color } {
  const candidate = material as Material & { color?: unknown }
  return candidate.color instanceof Color
}

/**
 * Разбирает загруженную сцену на куски, перекрашивает и вписывает
 * в габарит предмета.
 *
 * Материалы всегда клонируются. GLTFLoader отдаёт один и тот же объект
 * материала всем, кто загрузил этот файл, и перекраска на месте испортила
 * бы все прочие предметы из того же файла: доска объявлений и доска
 * в аудитории — это одна модель `paneling.glb` в двух разных цветах.
 */
export function buildPropParts(options: {
  root: Object3D
  transform: PropModelTransform
  tint: PropModelTint
  color: string
}): PropPart[] {
  const { root, transform, tint, color } = options
  const meshes = collectMeshes(root)
  const target = tint === 'dominant' ? dominantMaterial(meshes) : null
  const tinted = new Color(color)

  const fit = new Matrix4().compose(
    new Vector3(transform.position.x, transform.position.y, transform.position.z),
    new Quaternion(),
    new Vector3(transform.scale.x, transform.scale.y, transform.scale.z),
  )

  const clones = new Map<Material, Material>()
  const parts: PropPart[] = []

  for (const mesh of meshes) {
    const source = materialOf(mesh)
    if (!source) continue

    let material = clones.get(source)
    if (!material) {
      material = source.clone()
      const paint = tint === 'all' || (tint === 'dominant' && source === target)
      if (paint && isColorable(material)) material.color.copy(tinted)
      clones.set(source, material)
    }

    parts.push({
      geometry: mesh.geometry,
      material,
      matrix: new Matrix4().multiplyMatrices(fit, mesh.matrixWorld),
    })
  }

  return parts
}

/** Материалы, которые надо освободить, когда предмет исчезает со сцены. */
export function ownedMaterials(parts: readonly PropPart[]): Material[] {
  const seen = new Set<Material>()
  for (const part of parts) seen.add(part.material)
  return [...seen]
}

/**
 * Куда встаёт отдельный экземпляр предмета: центр его клетки плюс поворот.
 *
 * Поворот складывается из двух слагаемых. Первое — поворот размещения:
 * куда предмет повёрнут в этом здании. Второе — поправка модели: куда
 * смотрит сама модель. Разделять их важно, потому что первое — про
 * планировку, а второе — про файл, и путать их означает править
 * планировку при каждой замене модели.
 */
export function propPlacementMatrix(
  placement: PropPlacement,
  cellSize: number,
  rotationOffset: number,
): Matrix4 {
  const position = new Vector3(
    (placement.col + 0.5) * cellSize,
    0,
    (placement.row + 0.5) * cellSize,
  )
  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    placement.rotation + rotationOffset,
  )
  return new Matrix4().compose(position, rotation, new Vector3(1, 1, 1))
}

/** Матрица одного экземпляра одного куска модели в мировых координатах. */
export function propInstanceMatrix(
  part: PropPart,
  placement: PropPlacement,
  cellSize: number,
  model: PropModel,
): Matrix4 {
  const placed = propPlacementMatrix(placement, cellSize, model.rotationOffset ?? 0)
  return placed.multiply(part.matrix)
}
