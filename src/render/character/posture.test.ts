import { describe, expect, it } from 'vitest'
import {
  animationStepSeconds,
  ANIMATION_FAR_METRES,
  ANIMATION_NEAR_METRES,
  blendTowards,
  breathPhase,
  BREATH_PERIOD_SECONDS,
  HIP_ABOVE_SEAT,
  seatedDrop,
  seatedLegAngles,
  SIT_FADE_SECONDS,
} from './posture'

/** Рост и пропорции живого человека — по ним считаются все проверки ниже. */
const HIP = 0.92
const ANKLE = 0.07
const THIGH = 0.43
const SHIN = 0.42

/** Куда опустится таз на сиденье такой высоты. */
function seatedHip(seatHeight: number): number {
  return HIP - seatedDrop(HIP, seatHeight)
}

/** Где окажется щиколотка при таких углах. Прямая проверка того, что решала функция. */
function ankleHeight(seatHeight: number): number {
  const hip = seatedHip(seatHeight)
  const angles = seatedLegAngles({ hip, ankle: ANKLE, thigh: THIGH, shin: SHIN })
  return hip - THIGH * Math.cos(angles.thigh) - SHIN * Math.cos(angles.shin)
}

describe('посадка на сиденье', () => {
  it('таз опускается на высоту сиденья, а не на пол', () => {
    // Сидят тазом, а не копчиком: сустав остаётся выше плоскости сиденья.
    expect(seatedHip(0.48)).toBeCloseTo(0.48 + HIP_ABOVE_SEAT, 6)
  })

  it('на стуле человек ниже, чем стоя', () => {
    expect(seatedDrop(HIP, 0.48)).toBeGreaterThan(0.3)
  })

  it('на сиденье выше собственного таза человек не поднимается', () => {
    // Такой мебели в игре нет, но отрицательная посадка утопила бы
    // фигуру в полу вместо того, чтобы её поднять.
    expect(seatedDrop(HIP, 1.4)).toBe(0)
  })
})

describe('ноги сидящего', () => {
  it('на стуле обычной высоты ступня стоит на полу', () => {
    // Главное, ради чего вся эта тригонометрия: сидящий не висит
    // и не проваливается сквозь пол ботинками.
    expect(ankleHeight(0.48)).toBeCloseTo(ANKLE, 6)
  })

  it('на полу стоит и низкий человек, и высокий', () => {
    // Длины костей масштабируются вместе с ростом, а стул один на всех.
    for (const scale of [0.9, 1, 1.1]) {
      const hip = HIP * scale - seatedDrop(HIP * scale, 0.48)
      const angles = seatedLegAngles({
        hip,
        ankle: ANKLE * scale,
        thigh: THIGH * scale,
        shin: SHIN * scale,
      })
      const ankle =
        hip - THIGH * scale * Math.cos(angles.thigh) - SHIN * scale * Math.cos(angles.shin)
      expect(ankle, `рост ×${scale}`).toBeCloseTo(ANKLE * scale, 6)
    }
  })

  it('на стуле бедро отведено вперёд, а голень отвесна', () => {
    const angles = seatedLegAngles({ hip: seatedHip(0.48), ankle: ANKLE, thigh: THIGH, shin: SHIN })
    expect(angles.thigh).toBeGreaterThan(Math.PI / 4)
    expect(angles.thigh).toBeLessThanOrEqual(Math.PI / 2)
    expect(angles.shin).toBe(0)
  })

  it('на низком сиденье ноги вытягиваются вперёд', () => {
    // Голень длиннее просвета: отвесной ей уже не быть, иначе ступня
    // уйдёт под пол.
    const angles = seatedLegAngles({ hip: 0.3, ankle: ANKLE, thigh: THIGH, shin: SHIN })
    expect(angles.thigh).toBeCloseTo(Math.PI / 2, 6)
    expect(angles.shin).toBeGreaterThan(0)
    expect(0.3 - SHIN * Math.cos(angles.shin)).toBeCloseTo(ANKLE, 6)
  })

  it('на высоком сиденье ноги висят отвесно', () => {
    const angles = seatedLegAngles({ hip: 1.6, ankle: ANKLE, thigh: THIGH, shin: SHIN })
    expect(angles).toEqual({ thigh: 0, shin: 0 })
  })

  it('бессмысленные длины костей не выдают бессмысленных углов', () => {
    // Модель без ног или с вывернутым габаритом не должна выдавать NaN:
    // NaN в повороте кости разносит всю фигуру по сцене.
    for (const angles of [
      seatedLegAngles({ hip: 0.5, ankle: 0, thigh: 0, shin: 0 }),
      seatedLegAngles({ hip: Number.NaN, ankle: 0, thigh: THIGH, shin: SHIN }),
    ]) {
      expect(Number.isFinite(angles.thigh)).toBe(true)
      expect(Number.isFinite(angles.shin)).toBe(true)
    }
  })
})

describe('переход между позами', () => {
  it('за время перехода вес доходит от нуля до единицы', () => {
    let weight = 0
    for (let i = 0; i < 10; i++) weight = blendTowards(weight, 1, SIT_FADE_SECONDS / 10)
    expect(weight).toBeCloseTo(1, 6)
  })

  it('вес не выходит за пределы ни при каком кадре', () => {
    // Кадр в секунду длиной — это переключение вкладки и возврат обратно.
    expect(blendTowards(0.9, 1, 5)).toBe(1)
    expect(blendTowards(0.1, 0, 5)).toBe(0)
  })

  it('переход идёт в обе стороны', () => {
    expect(blendTowards(0.5, 1, 0.05)).toBeGreaterThan(0.5)
    expect(blendTowards(0.5, 0, 0.05)).toBeLessThan(0.5)
  })
})

describe('дыхание', () => {
  it('колеблется в обе стороны и возвращается', () => {
    expect(breathPhase(0, 0)).toBeCloseTo(0, 6)
    expect(breathPhase(BREATH_PERIOD_SECONDS / 4, 0)).toBeCloseTo(1, 6)
    expect(breathPhase(BREATH_PERIOD_SECONDS * 3 / 4, 0)).toBeCloseTo(-1, 6)
    expect(breathPhase(BREATH_PERIOD_SECONDS, 0)).toBeCloseTo(0, 6)
  })

  it('люди с разным сдвигом дышат вразнобой', () => {
    // Шестеро, вдыхающих одновременно, — это не этаж, а кордебалет.
    expect(breathPhase(1, 0)).not.toBeCloseTo(breathPhase(1, 0.37), 2)
  })
})

describe('частота пересчёта анимации', () => {
  it('вблизи анимация считается каждый кадр', () => {
    expect(animationStepSeconds(0)).toBe(0)
    expect(animationStepSeconds(ANIMATION_NEAR_METRES)).toBe(0)
  })

  it('чем дальше человек, тем реже пересчёт', () => {
    const near = animationStepSeconds(ANIMATION_NEAR_METRES + 1)
    const far = animationStepSeconds(ANIMATION_FAR_METRES + 1)
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
    // Даже у самых дальних пересчёт остаётся движением, а не слайд-шоу.
    expect(far).toBeLessThanOrEqual(1 / 10)
  })

  it('на бессмысленное расстояние отвечает как на ближнее', () => {
    expect(animationStepSeconds(Number.NaN)).toBe(0)
  })
})
