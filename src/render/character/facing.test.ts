import { describe, expect, it } from 'vitest'
import {
  characterYaw,
  facingDirection,
  GLTF_FACING_OFFSET,
  PROCEDURAL_FACING_OFFSET,
} from './facing'

/**
 * Проверка, о которой заказчик просил отдельно: персонаж не должен
 * ходить затылком вперёд.
 *
 * Сверяются не углы, а направления. Угол легко подогнать так, что тест
 * зелёный, а человек пятится: между «yaw равен такому-то числу» и
 * «фигура смотрит туда, куда идёт» разница ровно в знаке, который и
 * ошибаются. Поэтому тест поворачивает фигуру и смотрит, куда после
 * этого показывает её нос.
 */

/** Направление движения, как его считает симуляция: atan2(dz, dx). */
function facingOf(dx: number, dz: number): number {
  return Math.atan2(dz, dx)
}

/** Четыре стороны света в осях пола. */
const DIRECTIONS = [
  { name: 'вправо, вдоль +X', dx: 1, dz: 0 },
  { name: 'влево, вдоль −X', dx: -1, dz: 0 },
  { name: 'от камеры, вдоль +Z', dx: 0, dz: 1 },
  { name: 'к камере, вдоль −Z', dx: 0, dz: -1 },
]

/** Все углы, которые может выдать atan2, включая косые. */
const OFFSETS = [
  { name: 'модель смотрит вдоль +Z', offset: 0 },
  { name: 'модель смотрит вдоль +X', offset: Math.PI / 2 },
  { name: 'модель смотрит вдоль −Z', offset: Math.PI },
  { name: 'модель смотрит вдоль −X', offset: -Math.PI / 2 },
  { name: 'модель развёрнута наискось', offset: 0.7 },
]

describe('поворот фигуры', () => {
  for (const { name, offset } of OFFSETS) {
    describe(name, () => {
      for (const direction of DIRECTIONS) {
        it(`идёт ${direction.name} — и туда же смотрит`, () => {
          const facing = facingOf(direction.dx, direction.dz)
          const look = facingDirection(characterYaw(facing, offset), offset)
          expect(look.x).toBeCloseTo(direction.dx, 10)
          expect(look.z).toBeCloseTo(direction.dz, 10)
        })
      }

      it('на любом промежуточном направлении смотрит вперёд, а не назад', () => {
        for (let step = 0; step < 32; step++) {
          const facing = -Math.PI + (step / 32) * 2 * Math.PI
          const look = facingDirection(characterYaw(facing, offset), offset)
          // Скалярное произведение взгляда и хода: +1 — точно вперёд,
          // −1 — затылком вперёд. Ошибка в знаке даёт ровно −1.
          const along = look.x * Math.cos(facing) + look.z * Math.sin(facing)
          expect(along, `направление ${facing.toFixed(3)}`).toBeCloseTo(1, 10)
        }
      })
    })
  }

  it('разворот на месте: фигура доходит до нового направления, а не до его отражения', () => {
    // Разворот кругом — тот самый случай, на котором ошибка в знаке
    // не видна по одному кадру: и правильная, и зеркальная формула
    // повернут фигуру, но одна встанет лицом, другая спиной.
    const before = facingOf(1, 0)
    const after = facingOf(-1, 0)
    const look = facingDirection(characterYaw(after, GLTF_FACING_OFFSET), GLTF_FACING_OFFSET)
    expect(look.x).toBeCloseTo(-1, 10)
    expect(characterYaw(before, GLTF_FACING_OFFSET)).not.toBeCloseTo(
      characterYaw(after, GLTF_FACING_OFFSET),
      6,
    )
  })

  it('капсульный человечек и модель поворачиваются одинаково', () => {
    // Оба смотрят вдоль +Z, поэтому подмена одного другим не должна
    // разворачивать никого ни на градус.
    expect(GLTF_FACING_OFFSET).toBe(PROCEDURAL_FACING_OFFSET)
    for (const direction of DIRECTIONS) {
      const facing = facingOf(direction.dx, direction.dz)
      expect(characterYaw(facing, GLTF_FACING_OFFSET)).toBeCloseTo(
        characterYaw(facing, PROCEDURAL_FACING_OFFSET),
        10,
      )
    }
  })

  it('прежняя формула поворота сохранена дословно', () => {
    // До появления моделей поворот считался прямо в компонентах
    // как `-facing + Math.PI / 2`. Капсульный человечек не изменился,
    // значит и угол у него обязан остаться прежним.
    for (let step = 0; step < 16; step++) {
      const facing = -Math.PI + (step / 16) * 2 * Math.PI
      expect(characterYaw(facing, PROCEDURAL_FACING_OFFSET)).toBeCloseTo(
        -facing + Math.PI / 2,
        12,
      )
    }
  })
})
