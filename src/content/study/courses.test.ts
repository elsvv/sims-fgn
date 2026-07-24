import { describe, expect, it } from 'vitest'
import { validateCourse } from '../../sim/study/Course'
import { validateSchedule } from '../../sim/study/Schedule'
import { COURSES, ESSAYS, SCHEDULE, STUDY_CONFIG } from './courses'

describe('курсы первого курса', () => {
  it('все формулы корректны', () => {
    for (const course of Object.values(COURSES)) {
      expect(validateCourse(course), course.title).toEqual([])
    }
  })

  it('идентификатор курса совпадает с ключом каталога', () => {
    for (const [key, course] of Object.entries(COURSES)) {
      expect(course.id).toBe(key)
    }
  })

  it('у каждого курса есть преподаватель', () => {
    for (const course of Object.values(COURSES)) {
      expect(course.teacherId.length, course.title).toBeGreaterThan(0)
    }
  })

  it('расписание корректно', () => {
    expect(validateSchedule(SCHEDULE)).toEqual([])
  })

  it('каждое занятие ссылается на существующий курс', () => {
    for (const lesson of SCHEDULE) {
      expect(COURSES[lesson.courseId], lesson.id).toBeDefined()
    }
  })

  it('у каждого курса есть хотя бы одно занятие в расписании', () => {
    for (const id of Object.keys(COURSES)) {
      expect(SCHEDULE.some((lesson) => lesson.courseId === id), id).toBe(true)
    }
  })

  it('номера аудиторий выглядят как настоящие', () => {
    for (const lesson of SCHEDULE) {
      expect(lesson.room, lesson.id).toMatch(/^[А-Я]-\d{3}$/)
    }
  })

  it('каждое эссе ссылается на существующий элемент контроля', () => {
    for (const task of ESSAYS) {
      const course = COURSES[task.courseId]
      expect(course, task.id).toBeDefined()
      expect(course!.assessments.some((a) => a.id === task.assessmentId), task.id).toBe(true)
    }
  })

  it('дедлайны эссе попадают внутрь модуля', () => {
    for (const task of ESSAYS) {
      expect(task.dueDay, task.id).toBeGreaterThan(0)
      expect(task.dueDay, task.id).toBeLessThan(42)
    }
  })

  it('конфигурация собрана целиком', () => {
    expect(STUDY_CONFIG.courses).toBe(COURSES)
    expect(STUDY_CONFIG.schedule).toBe(SCHEDULE)
    expect(STUDY_CONFIG.essays).toBe(ESSAYS)
  })
})
