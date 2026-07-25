import { describe, expect, it } from 'vitest'
import { fitPropModel, fittedBounds, isUsableBounds, type ModelBounds } from './fitPropModel'
import type { PropModel, PropSize } from './PropDefinition'

/** Куб от нуля до двух: начало координат в углу основания, как у Kenney. */
const CUBE: ModelBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }

/** Метровая клетка, как в планировке этажа. */
const CELL = 1

function boundsOf(w: number, h: number, d: number, minY = 0): ModelBounds {
  return {
    min: { x: -w / 2, y: minY, z: -d / 2 },
    max: { x: w / 2, y: minY + h, z: d / 2 },
  }
}

function model(overrides: Partial<PropModel> = {}): PropModel {
  return { url: '/models/props/test.glb', fit: 'contain', ...overrides }
}

const SIZE: PropSize = { w: 1, d: 1, h: 1 }

describe('годность габарита', () => {
  it('обычный габарит годится', () => {
    expect(isUsableBounds(CUBE)).toBe(true)
  })

  it('пустой Box3 из three.js не годится', () => {
    // Box3.makeEmpty() — ровно эти значения. Модель без единого меша
    // возвращает именно их, и делить на них нельзя.
    expect(
      isUsableBounds({
        min: { x: Infinity, y: Infinity, z: Infinity },
        max: { x: -Infinity, y: -Infinity, z: -Infinity },
      }),
    ).toBe(false)
  })

  it('NaN не годится', () => {
    expect(isUsableBounds({ min: { x: NaN, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })).toBe(
      false,
    )
  })

  it('точка без размера не годится', () => {
    expect(isUsableBounds({ min: { x: 1, y: 1, z: 1 }, max: { x: 1, y: 1, z: 1 } })).toBe(false)
  })

  it('плоская панель годится: у неё есть две оси', () => {
    expect(isUsableBounds(boundsOf(1, 1, 0))).toBe(true)
  })
})

describe('подгонка модели под габарит предмета', () => {
  it('stretch растягивает каждую ось до своего размера', () => {
    const fit = fitPropModel({
      bounds: CUBE,
      size: { w: 1, d: 0.5, h: 2 },
      model: model({ fit: 'stretch' }),
      cellSize: CELL,
    })
    expect(fit.scale).toEqual({ x: 0.5, y: 1, z: 0.25 })
  })

  it('contain берёт наименьший множитель и сохраняет пропорции', () => {
    const fit = fitPropModel({
      bounds: CUBE,
      size: { w: 1, d: 0.5, h: 2 },
      model: model({ fit: 'contain' }),
      cellSize: CELL,
    })
    expect(fit.scale).toEqual({ x: 0.25, y: 0.25, z: 0.25 })
  })

  it('contain не выходит за габарит ни по одной оси', () => {
    const bounds = boundsOf(1.47, 0.77, 0.78)
    const size: PropSize = { w: 0.9, d: 0.6, h: 0.75 }
    const fit = fitPropModel({ bounds, size, model: model(), cellSize: CELL })
    const box = fittedBounds(bounds, fit)
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(size.w + 1e-9)
    expect(box.max.y - box.min.y).toBeLessThanOrEqual(size.h + 1e-9)
    expect(box.max.z - box.min.z).toBeLessThanOrEqual(size.d + 1e-9)
  })

  it('stretch заполняет габарит ровно', () => {
    const bounds = boundsOf(1.47, 0.77, 0.78)
    const size: PropSize = { w: 0.9, d: 0.6, h: 0.75 }
    const fit = fitPropModel({ bounds, size, model: model({ fit: 'stretch' }), cellSize: CELL })
    const box = fittedBounds(bounds, fit)
    expect(box.max.x - box.min.x).toBeCloseTo(size.w, 9)
    expect(box.max.y - box.min.y).toBeCloseTo(size.h, 9)
    expect(box.max.z - box.min.z).toBeCloseTo(size.d, 9)
  })

  it('множитель scale применяется поверх подгонки', () => {
    const plain = fitPropModel({ bounds: CUBE, size: SIZE, model: model(), cellSize: CELL })
    const scaled = fitPropModel({
      bounds: CUBE,
      size: SIZE,
      model: model({ scale: 0.5 }),
      cellSize: CELL,
    })
    expect(scaled.scale.x).toBeCloseTo(plain.scale.x / 2, 9)
    expect(scaled.scale.y).toBeCloseTo(plain.scale.y / 2, 9)
  })
})

describe('предмет стоит на полу', () => {
  it('модель с началом координат в основании садится на ноль', () => {
    const fit = fitPropModel({ bounds: CUBE, size: SIZE, model: model(), cellSize: CELL })
    expect(fittedBounds(CUBE, fit).min.y).toBeCloseTo(0, 9)
  })

  it('модель, у которой начало координат не в основании, не проваливается', () => {
    // Настенная раковина набора: minY = -0.40 в единицах модели.
    // По нулю она ушла бы под пол на сорок сантиметров.
    const bounds = boundsOf(0.34, 0.56, 0.29, -0.4)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.6, d: 0.5, h: 1 },
      model: model(),
      cellSize: CELL,
    })
    expect(fittedBounds(bounds, fit).min.y).toBeCloseTo(0, 9)
  })

  it('модель, висящая над началом координат, опускается на пол', () => {
    const bounds = boundsOf(1, 1, 1, 3)
    const fit = fitPropModel({ bounds, size: SIZE, model: model(), cellSize: CELL })
    expect(fittedBounds(bounds, fit).min.y).toBeCloseTo(0, 9)
  })

  it('сдвиг по высоте вешает предмет на стену от пола, а не от начала координат', () => {
    const bounds = boundsOf(1, 1, 0.1, -5)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.1, h: 1.2 },
      model: model({ fit: 'stretch', offset: { y: 0.75 } }),
      cellSize: CELL,
    })
    const box = fittedBounds(bounds, fit)
    expect(box.min.y).toBeCloseTo(0.75, 9)
    expect(box.max.y).toBeCloseTo(0.75 + 1.2, 9)
  })
})

describe('положение внутри клетки', () => {
  it('по умолчанию предмет стоит посередине клетки', () => {
    const bounds = boundsOf(0.4, 0.5, 0.2)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.5, h: 0.95 },
      model: model(),
      cellSize: CELL,
    })
    const box = fittedBounds(bounds, fit)
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 9)
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 9)
  })

  it('центрирование считается по габариту, а не по началу координат', () => {
    // Начало координат в углу: без учёта габарита предмет уехал бы
    // на пол-модели в сторону.
    const bounds: ModelBounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }
    const fit = fitPropModel({ bounds, size: SIZE, model: model(), cellSize: CELL })
    const box = fittedBounds(bounds, fit)
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 9)
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 9)
  })

  it('align: back прижимает предмет к дальнему краю клетки', () => {
    const bounds = boundsOf(0.4, 0.5, 0.2)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.5, h: 0.95 },
      model: model({ align: 'back' }),
      cellSize: CELL,
    })
    const box = fittedBounds(bounds, fit)
    expect(box.min.z).toBeCloseTo(-CELL / 2, 9)
  })

  it('прижатый к стене предмет всё равно не вылезает из клетки вперёд', () => {
    const bounds = boundsOf(0.4, 0.5, 0.2)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.5, h: 0.95 },
      model: model({ align: 'back' }),
      cellSize: CELL,
    })
    const box = fittedBounds(bounds, fit)
    expect(box.max.z).toBeLessThanOrEqual(CELL / 2 + 1e-9)
  })

  it('сдвиг по осям складывается с выравниванием', () => {
    const bounds = boundsOf(0.4, 0.5, 0.2)
    const base = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.5, h: 0.95 },
      model: model({ align: 'back' }),
      cellSize: CELL,
    })
    const moved = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.5, h: 0.95 },
      model: model({ align: 'back', offset: { x: 0.1, z: 0.05 } }),
      cellSize: CELL,
    })
    expect(moved.position.x).toBeCloseTo(base.position.x + 0.1, 9)
    expect(moved.position.z).toBeCloseTo(base.position.z + 0.05, 9)
  })
})

describe('вырожденные габариты не роняют счёт', () => {
  it('плоская по одной оси модель не даёт ни бесконечности, ни NaN', () => {
    const bounds = boundsOf(1, 1, 0)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.1, h: 1.2 },
      model: model({ fit: 'stretch' }),
      cellSize: CELL,
    })
    for (const value of [fit.scale.x, fit.scale.y, fit.scale.z]) {
      expect(Number.isFinite(value)).toBe(true)
    }
    for (const value of [fit.position.x, fit.position.y, fit.position.z]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })

  it('плоская модель при contain остаётся пропорциональной', () => {
    const bounds = boundsOf(1, 1, 0)
    const fit = fitPropModel({
      bounds,
      size: { w: 0.9, d: 0.1, h: 1.2 },
      model: model(),
      cellSize: CELL,
    })
    expect(fit.scale.x).toBeCloseTo(fit.scale.y, 9)
    expect(fit.scale.z).toBeCloseTo(fit.scale.y, 9)
  })
})
