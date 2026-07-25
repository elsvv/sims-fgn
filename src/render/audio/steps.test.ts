import { describe, expect, it } from 'vitest'
import { STEP_SOUNDS } from './catalog'
import { IDLE_STEPS, STEP_INTERVAL_SECONDS, advanceSteps } from './steps'

/** Период опроса звукового слоя и запас, с которыми это работает в игре. */
const LOOKAHEAD = 0.18
const TICK = 0.1

describe('шаги', () => {
  it('стоящий персонаж молчит', () => {
    expect(advanceSteps(IDLE_STEPS, false, 0, LOOKAHEAD).steps).toEqual([])
  })

  it('первый шаг звучит сразу, как только тронулся', () => {
    // Пауза перед первым шагом читается как задержка звука, а не как
    // начало ходьбы.
    const tick = advanceSteps(IDLE_STEPS, true, 5, LOOKAHEAD)
    expect(tick.steps[0]?.at).toBe(5)
  })

  it('шаги идут ровно через положенный промежуток', () => {
    let state = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD).state
    const times: number[] = []
    for (let tick = 1; tick <= 30; tick++) {
      const result = advanceSteps(state, true, tick * TICK, LOOKAHEAD)
      state = result.state
      for (const step of result.steps) times.push(step.at)
    }
    expect(times.length).toBeGreaterThan(4)
    for (let i = 1; i < times.length; i++) {
      const gap = (times[i] ?? 0) - (times[i - 1] ?? 0)
      expect(gap).toBeCloseTo(STEP_INTERVAL_SECONDS, 6)
    }
  })

  it('назначенные шаги лежат в будущем, а не в прошлом', () => {
    let state = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD).state
    for (let tick = 1; tick <= 20; tick++) {
      const now = tick * TICK
      const result = advanceSteps(state, true, now, LOOKAHEAD)
      state = result.state
      for (const step of result.steps) {
        expect(step.at).toBeGreaterThanOrEqual(now)
        expect(step.at).toBeLessThan(now + LOOKAHEAD)
      }
    }
  })

  it('ни один шаг не назначается дважды', () => {
    let state = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD).state
    const times = new Set<number>()
    for (let tick = 1; tick <= 40; tick++) {
      const result = advanceSteps(state, true, tick * TICK, LOOKAHEAD)
      state = result.state
      for (const step of result.steps) {
        expect(times.has(step.at)).toBe(false)
        times.add(step.at)
      }
    }
  })

  it('записи шагов чередуются', () => {
    // Одна и та же запись подряд превращает ходьбу в метроном.
    let state = IDLE_STEPS
    const ids: string[] = []
    for (let tick = 0; tick < 40 && ids.length < 4; tick++) {
      const result = advanceSteps(state, true, tick * TICK, LOOKAHEAD)
      state = result.state
      for (const step of result.steps) ids.push(step.id)
    }
    expect(ids.slice(0, 3)).toEqual([...STEP_SOUNDS])
    expect(ids[3]).toBe(STEP_SOUNDS[0])
  })

  it('на тройной скорости ноги переставляются втрое чаще', () => {
    // Персонаж и правда идёт втрое быстрее: шаги обязаны поспевать,
    // иначе фигура едет по коридору как на роликах.
    // За один и тот же промежуток на тройной скорости шагов помещается
    // втрое больше — они и назначаются пачкой за один опрос.
    const fast = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD, 3)
    const usual = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD, 1)
    expect(usual.steps).toHaveLength(1)
    expect(fast.steps.length).toBeGreaterThan(1)
    expect(fast.steps[1]?.at).toBeCloseTo(STEP_INTERVAL_SECONDS / 3, 6)
  })

  it('на паузе шаги не назначаются', () => {
    // На нулевой скорости персонаж не двигается вовсе, и moving = false.
    expect(advanceSteps(IDLE_STEPS, false, 0, LOOKAHEAD, 0).steps).toEqual([])
  })

  it('остановка обрывает ходьбу, а возобновление начинает её заново', () => {
    const walking = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD)
    const stopped = advanceSteps(walking.state, false, 1, LOOKAHEAD)
    expect(stopped.state.moving).toBe(false)
    const again = advanceSteps(stopped.state, true, 10, LOOKAHEAD)
    expect(again.steps[0]?.at).toBe(10)
  })

  it('замерший таймер не приносит сотню шагов разом', () => {
    // Свёрнутая вкладка возвращается с дельтой в минуту. Назначить
    // за неё двести шагов — значит устроить очередь на полминуты.
    const walking = advanceSteps(IDLE_STEPS, true, 0, LOOKAHEAD)
    const late = advanceSteps(walking.state, true, 0.01, 60)
    expect(late.steps.length).toBeLessThanOrEqual(6)
  })
})
