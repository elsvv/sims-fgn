import type { AttendanceMark } from '../../sim/study/Attendance'
import {
  lessonAt,
  lessonsOnDay,
  occurrenceId,
  periodOf,
  type Lesson,
} from '../../sim/study/Schedule'
import { useWorld, useWorldSnapshot } from '../useWorld'

const MARK_LABELS: Record<AttendanceMark, string> = {
  present: 'был',
  late: 'опоздал',
  absent: 'прогул',
}

const KIND_LABELS: Record<Lesson['kind'], string> = {
  lecture: 'лекция',
  seminar: 'семинар',
}

/**
 * Расписание на сегодня: во сколько, что и где. Панель отвечает
 * на единственный вопрос, который вообще есть у первокурсника
 * в коридоре, — куда сейчас идти.
 */
export function SchedulePanel() {
  const world = useWorld()
  const snapshot = useWorldSnapshot()
  const study = world.study
  if (!study) return null

  const lessons = lessonsOnDay(study.config.schedule, snapshot.day)
  const current = lessonAt(study.config.schedule, snapshot.day, snapshot.minutes)

  return (
    <div className="hud__panel hud__schedule">
      <div className="hud__panel-title">Расписание на сегодня</div>

      {lessons.length === 0 ? (
        <div className="lesson__empty">Занятий нет</div>
      ) : (
        lessons.map((lesson) => {
          const course = study.config.courses[lesson.courseId]
          // Отметка ищется за сегодняшнюю пару: в расписании стоит слот,
          // а в журнале — конкретный день.
          const mark = study.attendance.markFor(occurrenceId(snapshot.day, lesson.id))
          return (
            <div
              className="lesson"
              key={lesson.id}
              data-current={lesson.id === current?.id}
              title={KIND_LABELS[lesson.kind]}
            >
              <div className="lesson__time">{periodOf(lesson.period)?.label ?? ''}</div>
              <div className="lesson__body">
                <div className="lesson__course">{course?.short ?? lesson.courseId}</div>
                {/* Вид пары стоит рядом с аудиторией, а не в подсказке при
                    наведении: выступают только на семинарах, и решать,
                    куда идти, игрок должен читая расписание, а не проверяя
                    каждую пару собой. */}
                <div className="lesson__room">
                  {KIND_LABELS[lesson.kind]}, {lesson.room}
                </div>
              </div>
              {mark && <div className={`lesson__mark lesson__mark--${mark}`}>{MARK_LABELS[mark]}</div>}
            </div>
          )
        })
      )}

      <div className="hud__where">Сейчас: {snapshot.currentRoom ?? 'в дверях'}</div>

      {snapshot.nextLesson && (
        <div className="hud__next">
          Следующая пара через {Math.ceil(snapshot.nextLesson.startsInMinutes)} мин,{' '}
          {snapshot.nextLesson.room}
        </div>
      )}
    </div>
  )
}
