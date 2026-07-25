import { MAX_GRADE } from './Course'

export interface EssayTask {
  id: string
  courseId: string
  /** Идентификатор элемента контроля, за который идёт оценка. */
  assessmentId: string
  title: string
  /** Игровой день, до конца которого нужно сдать. */
  dueDay: number
  /** Сколько игровых минут работы нужно для полноценного эссе. */
  requiredEffort: number
}

export interface EssayProgress {
  /** Вложенные игровые минуты. */
  effort: number
  /** Накопленное качество, 0..1 от идеала. */
  quality: number
  submitted: boolean
  submittedDay: number | null
  cheated: boolean
}

/** Условия, в которых студент работает над текстом. */
export interface WorkContext {
  /** Навык академического письма, 0..10. */
  writingSkill: number
  /** Текущий стресс, 0..100. */
  stress: number
}

/** Во сколько раз штрафуется оценка за просрочку. */
const OVERDUE_PENALTY = 0.5

/** Ход работы над всеми эссе сразу: ключ — идентификатор задания. */
export type EssayRecords = Record<string, EssayProgress>

export class EssayJournal {
  private progress: EssayRecords = {}

  start(task: EssayTask): void {
    if (this.progress[task.id]) return
    this.progress[task.id] = {
      effort: 0,
      quality: 0,
      submitted: false,
      submittedDay: null,
      cheated: false,
    }
  }

  progressFor(taskId: string): EssayProgress | null {
    return this.progress[taskId] ?? null
  }

  /**
   * Засчитывает потраченное на эссе время.
   * Качество вложенных минут зависит от навыка письма и стресса:
   * писать в панике можно, но выйдет заметно хуже.
   */
  work(taskId: string, minutes: number, context: WorkContext): void {
    const current = this.progress[taskId]
    if (!current || current.submitted) return

    const skillFactor = 0.6 + (context.writingSkill / MAX_GRADE) * 0.6
    const stressFactor = 1 - (context.stress / 100) * 0.5
    const gained = minutes * skillFactor * stressFactor

    current.effort += minutes
    current.quality += gained
  }

  /**
   * Списать: эссе мгновенно доводится до формальной готовности, но помечается.
   * Потраченное время не растёт — в этом весь смысл соблазна.
   * Метка cheated позже даёт шанс получить ноль за нарушение академических норм.
   */
  cheat(task: EssayTask): void {
    const current = this.progress[task.id]
    if (!current || current.submitted) return
    current.cheated = true
    current.quality = Math.max(current.quality, task.requiredEffort)
  }

  submit(taskId: string, day: number): void {
    const current = this.progress[taskId]
    if (!current || current.submitted) return
    current.submitted = true
    current.submittedDay = day
  }

  isOverdue(task: EssayTask, currentDay: number): boolean {
    const current = this.progress[task.id]
    if (current?.submitted) return false
    return currentDay > task.dueDay
  }

  toJSON(): EssayRecords {
    return JSON.parse(JSON.stringify(this.progress)) as EssayRecords
  }

  /** Возвращает состояние на место, в уже существующий журнал. */
  load(progress: EssayRecords): void {
    this.progress = JSON.parse(JSON.stringify(progress)) as EssayRecords
  }

  static fromJSON(progress: EssayRecords): EssayJournal {
    const journal = new EssayJournal()
    journal.load(progress)
    return journal
  }
}

/**
 * Оценка за эссе, 0..10.
 * Несданное — ноль. Сданное после дедлайна — половина.
 */
export function essayGrade(
  progress: EssayProgress,
  task: EssayTask,
  submittedDay: number,
): number {
  if (!progress.submitted) return 0

  const completeness = Math.min(1, progress.quality / task.requiredEffort)
  let grade = completeness * MAX_GRADE

  if (submittedDay > task.dueDay) grade *= OVERDUE_PENALTY

  return Math.min(MAX_GRADE, Math.max(0, grade))
}
