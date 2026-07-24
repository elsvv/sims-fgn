import { describe, expect, it } from 'vitest'
import {
  dayKind,
  describeDay,
  isStudyDay,
  SESSION_WEEK,
  STUDY_WEEKS,
  TOTAL_DAYS,
  weekdayOf,
  weekOf,
} from './Calendar'

describe('календарь модуля', () => {
  it('модуль длится шесть учебных недель плюс сессионная', () => {
    expect(STUDY_WEEKS).toBe(6)
    expect(SESSION_WEEK).toBe(6)
    expect(TOTAL_DAYS).toBe(49)
  })

  it('считает номер недели', () => {
    expect(weekOf(0)).toBe(0)
    expect(weekOf(6)).toBe(0)
    expect(weekOf(7)).toBe(1)
    expect(weekOf(41)).toBe(5)
    expect(weekOf(42)).toBe(6)
  })

  it('считает день недели, где 0 — понедельник', () => {
    expect(weekdayOf(0)).toBe(0)
    expect(weekdayOf(5)).toBe(5)
    expect(weekdayOf(6)).toBe(6)
    expect(weekdayOf(7)).toBe(0)
  })

  it('суббота учебная, воскресенье выходное', () => {
    expect(dayKind(5)).toBe('study')
    expect(dayKind(6)).toBe('weekend')
    expect(isStudyDay(5)).toBe(true)
    expect(isStudyDay(6)).toBe(false)
  })

  it('седьмая неделя — сессия', () => {
    expect(dayKind(42)).toBe('session')
    expect(dayKind(47)).toBe('session')
    expect(isStudyDay(42)).toBe(false)
  })

  it('воскресенье сессионной недели всё равно выходное', () => {
    expect(dayKind(48)).toBe('weekend')
  })

  it('после сессии модуль окончен', () => {
    expect(dayKind(49)).toBe('over')
    expect(dayKind(100)).toBe('over')
  })

  it('описывает день по-русски', () => {
    expect(describeDay(0)).toBe('Неделя 1, понедельник')
    expect(describeDay(5)).toBe('Неделя 1, суббота')
    expect(describeDay(42)).toBe('Сессия, понедельник')
    expect(describeDay(49)).toBe('Модуль окончен')
  })
})
