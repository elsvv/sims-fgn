import type { PropModel, PropSize, Vec3 } from './PropDefinition'

/**
 * Измеренный габарит модели в её собственных единицах.
 * Кто измерил — не важно: рендер берёт `Box3` у загруженной сцены,
 * тест читает min/max прямо из файла GLB. Считает по ним один и тот же код.
 */
export interface ModelBounds {
  min: Vec3
  max: Vec3
}

/**
 * Куда и в каком масштабе ставить модель внутри клетки — до поворота
 * размещения. Поворот делается вокруг центра клетки, поэтому положение
 * считается в системе координат предмета, а не мира.
 */
export interface PropModelTransform {
  scale: Vec3
  position: Vec3
}

/** Меньше микрометра — это ноль. Плоские панели набора толщиной 3 см сюда не попадают. */
const EPSILON = 1e-6

function extents(bounds: ModelBounds): Vec3 {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  }
}

/**
 * Годится ли габарит для подгонки.
 *
 * Пустой `Box3` из three.js — это `+Infinity`/`-Infinity`, а модель без
 * единого треугольника даёт нулевой размер по всем осям. И то и другое
 * означает, что ставить нечего: рендер обязан нарисовать запасной бокс,
 * а не делить на ноль и не разбрасывать по сцене NaN.
 */
export function isUsableBounds(bounds: ModelBounds): boolean {
  const numbers = [
    bounds.min.x,
    bounds.min.y,
    bounds.min.z,
    bounds.max.x,
    bounds.max.y,
    bounds.max.z,
  ]
  if (!numbers.every((value) => Number.isFinite(value))) return false

  const size = extents(bounds)
  const sides = [size.x, size.y, size.z]
  if (sides.some((side) => side < -EPSILON)) return false
  return sides.some((side) => side > EPSILON)
}

/** Во сколько раз каждую ось надо растянуть, чтобы она заняла свой габарит. */
function axisRatios(size: Vec3, target: Vec3): (number | null)[] {
  return [
    size.x > EPSILON ? target.x / size.x : null,
    size.y > EPSILON ? target.y / size.y : null,
    size.z > EPSILON ? target.z / size.z : null,
  ]
}

/**
 * Вписывает модель в габарит предмета: считает масштаб по осям и положение
 * внутри клетки.
 *
 * Три вещи, ради которых эта функция существует и которые ломаются чаще
 * всего:
 *
 * 1. Модель встаёт на пол. Не «начало координат в ноль», а именно нижняя
 *    грань измеренного габарита: у четырёх моделей набора начало координат
 *    стоит не в основании, и по нулю они проваливаются под пол.
 * 2. Модель не вылезает из клетки. Ширина и глубина не могут превысить
 *    габарит предмета, а он, в свою очередь, не больше клетки навигации:
 *    видимое обязано совпадать с проходимым.
 * 3. Модель центрируется по измеренному габариту, а не по началу координат.
 *
 * Функция чистая и ничего не знает ни про three.js, ни про react —
 * ровно поэтому её можно проверить настоящими габаритами настоящих файлов.
 */
export function fitPropModel(options: {
  bounds: ModelBounds
  size: PropSize
  model: PropModel
  /** Размер клетки навигации в метрах: по нему прижимается `align: 'back'`. */
  cellSize: number
}): PropModelTransform {
  const { bounds, size, model, cellSize } = options
  const source = extents(bounds)
  const target: Vec3 = { x: size.w, y: size.h, z: size.d }
  const ratios = axisRatios(source, target)
  const known = ratios.filter((ratio): ratio is number => ratio !== null)

  // Ось нулевой толщины растягивать не во что: ей достаётся самый
  // осторожный из известных множителей, лишь бы не появилось бесконечности.
  const uniform = known.length > 0 ? Math.min(...known) : 1
  const extra = model.scale ?? 1

  const scale: Vec3 =
    model.fit === 'stretch'
      ? {
          x: (ratios[0] ?? uniform) * extra,
          y: (ratios[1] ?? uniform) * extra,
          z: (ratios[2] ?? uniform) * extra,
        }
      : { x: uniform * extra, y: uniform * extra, z: uniform * extra }

  const offset = model.offset ?? {}
  const center: Vec3 = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }

  // Прижать спиной к дальнему краю клетки: сдвиг считается по настоящей
  // глубине после масштабирования, а не по объявленной. У `contain`
  // это разные числа.
  const fittedDepth = source.z * scale.z
  const backShift =
    model.align === 'back' ? -Math.max(0, (cellSize - fittedDepth) / 2) : 0

  return {
    scale,
    position: {
      x: -center.x * scale.x + (offset.x ?? 0),
      y: -bounds.min.y * scale.y + (offset.y ?? 0),
      z: -center.z * scale.z + backShift + (offset.z ?? 0),
    },
  }
}

/**
 * Габарит модели после подгонки, в метрах, в системе координат предмета.
 * Нужен проверкам: по нему видно, стоит ли предмет на полу и влезает ли
 * он в клетку.
 */
export function fittedBounds(
  bounds: ModelBounds,
  transform: PropModelTransform,
): ModelBounds {
  const { scale, position } = transform
  const at = (value: Vec3): Vec3 => ({
    x: value.x * scale.x + position.x,
    y: value.y * scale.y + position.y,
    z: value.z * scale.z + position.z,
  })
  const a = at(bounds.min)
  const b = at(bounds.max)
  return {
    min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
    max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
  }
}
