import { describe, expect, it } from 'vitest'
import { EssayJournal, essayGrade, type EssayTask } from './Essay'

const TASK: EssayTask = {
  id: 'essay-nis',
  courseId: 'nis',
  assessmentId: 'essay',
  title: 'Финальное эссе',
  dueDay: 30,
  requiredEffort: 300,
}

describe('EssayJournal', () => {
  it('незапущенное эссе не имеет прогресса', () => {
    expect(new EssayJournal().progressFor(TASK.id)).toBeNull()
  })

  it('запускает работу над эссе', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    const progress = journal.progressFor(TASK.id)
    expect(progress?.effort).toBe(0)
    expect(progress?.submitted).toBe(false)
  })

  it('накапливает усилия', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, 60, { writingSkill: 5, stress: 20 })
    journal.work(TASK.id, 60, { writingSkill: 5, stress: 20 })
    expect(journal.progressFor(TASK.id)!.effort).toBe(120)
  })

  it('высокий стресс снижает качество вложенного времени', () => {
    const calm = new EssayJournal()
    calm.start(TASK)
    calm.work(TASK.id, 120, { writingSkill: 5, stress: 0 })

    const panicking = new EssayJournal()
    panicking.start(TASK)
    panicking.work(TASK.id, 120, { writingSkill: 5, stress: 95 })

    expect(calm.progressFor(TASK.id)!.quality).toBeGreaterThan(
      panicking.progressFor(TASK.id)!.quality,
    )
  })

  it('навык письма повышает качество', () => {
    const novice = new EssayJournal()
    novice.start(TASK)
    novice.work(TASK.id, 120, { writingSkill: 0, stress: 20 })

    const master = new EssayJournal()
    master.start(TASK)
    master.work(TASK.id, 120, { writingSkill: 10, stress: 20 })

    expect(master.progressFor(TASK.id)!.quality).toBeGreaterThan(
      novice.progressFor(TASK.id)!.quality,
    )
  })

  it('работа над сданным эссе игнорируется', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, 300, { writingSkill: 5, stress: 10 })
    journal.submit(TASK.id, 20)
    journal.work(TASK.id, 300, { writingSkill: 5, stress: 10 })
    expect(journal.progressFor(TASK.id)!.effort).toBe(300)
  })

  it('видит просрочку', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    expect(journal.isOverdue(TASK, 29)).toBe(false)
    expect(journal.isOverdue(TASK, 31)).toBe(true)
    journal.submit(TASK.id, 25)
    expect(journal.isOverdue(TASK, 31)).toBe(false)
  })

  it('списывание отмечается отдельно и мгновенно доводит эссе до готовности', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.cheat(TASK)
    const progress = journal.progressFor(TASK.id)!
    expect(progress.cheated).toBe(true)
    expect(progress.quality).toBe(TASK.requiredEffort)
    // Списавший не потратил на текст ни минуты — в этом и смысл.
    expect(progress.effort).toBe(0)
  })
})

describe('essayGrade', () => {
  it('несданное эссе — ноль', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    expect(essayGrade(journal.progressFor(TASK.id)!, TASK, 31)).toBe(0)
  })

  it('полностью проработанное эссе даёт высокую оценку', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, TASK.requiredEffort, { writingSkill: 8, stress: 10 })
    journal.submit(TASK.id, 28)
    expect(essayGrade(journal.progressFor(TASK.id)!, TASK, 28)).toBeGreaterThanOrEqual(8)
  })

  it('недоработанное эссе оценивается ниже', () => {
    const journal = new EssayJournal()
    journal.start(TASK)
    journal.work(TASK.id, TASK.requiredEffort / 4, { writingSkill: 8, stress: 10 })
    journal.submit(TASK.id, 28)
    expect(essayGrade(journal.progressFor(TASK.id)!, TASK, 28)).toBeLessThan(6)
  })

  it('сдача после дедлайна штрафуется', () => {
    const late = new EssayJournal()
    late.start(TASK)
    late.work(TASK.id, TASK.requiredEffort, { writingSkill: 8, stress: 10 })
    late.submit(TASK.id, 33)

    const onTime = new EssayJournal()
    onTime.start(TASK)
    onTime.work(TASK.id, TASK.requiredEffort, { writingSkill: 8, stress: 10 })
    onTime.submit(TASK.id, 28)

    expect(essayGrade(late.progressFor(TASK.id)!, TASK, 33)).toBeLessThan(
      essayGrade(onTime.progressFor(TASK.id)!, TASK, 28),
    )
  })
})
