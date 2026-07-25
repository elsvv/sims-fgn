import { TEACHERS } from '../../content/people/teachers'
import { PASSING_GRADE } from '../../sim/study/Course'
import type { SeminarSpeechInfo } from '../../sim/World'
import { useWorld, useWorldSnapshot } from '../useWorld'

/** Как преподавателя зовут в лицо: полное имя с отчеством. */
function teacherName(teacherId: string | null): string | null {
  if (!teacherId) return null
  return TEACHERS[teacherId]?.name ?? teacherId
}

/** Фамилия — для заголовка, как в расписании. */
function teacherSurname(teacherId: string | null): string | null {
  if (!teacherId) return null
  return TEACHERS[teacherId]?.short ?? teacherId
}

/**
 * Ответ преподавателя на выступление.
 *
 * Это момент, ради которого игра существует: цифра в ведомости и живая
 * реплика тем же голосом, каким этот человек говорит в коридоре. Поэтому
 * реплика стоит выше оценки — сначала слышишь, потом узнаёшь балл.
 */
function SpeechResult({ speech }: { speech: SeminarSpeechInfo }) {
  const world = useWorld()
  const name = teacherName(speech.teacherId)

  return (
    <>
      {name && <div className="dialogue__speaker">{name}</div>}
      {speech.reply && <div className="dialogue__reply">{speech.reply}</div>}

      <div className="seminar__verdict">
        <span
          className={`seminar__grade seminar__grade--${speech.success ? 'good' : 'bad'}`}
        >
          {speech.grade}
        </span>
        <span className="seminar__verdict-text">
          {speech.success
            ? 'за выступление. Идёт в накопленную оценку.'
            : `за выступление. Проходной балл — ${PASSING_GRADE}.`}
        </span>
      </div>

      <button
        type="button"
        className="hud__menu-item dialogue__continue"
        onClick={() => world.dismissSeminarSpeech()}
      >
        Сесть на место
      </button>
    </>
  )
}

/**
 * Панель выступления на семинаре.
 *
 * Появляется, только когда игрок сидит на семинаре, и исчезает, когда он
 * выходит или когда пара кончилась. Под каждым способом выступить написано,
 * чем он обернётся: ставку игрок должен видеть до того, как её сделал,
 * а не узнавать из оценки.
 */
export function SeminarPanel() {
  const world = useWorld()
  const { seminar } = useWorldSnapshot()
  if (!seminar) return null

  const course = world.study?.config.courses[seminar.courseId]
  // В заголовке фамилия, как в расписании: полное имя с отчеством прозвучит
  // ниже, над репликой, и повторять его дважды незачем.
  const surname = teacherSurname(seminar.teacherId)

  return (
    <div className="hud__panel hud__seminar">
      <div className="hud__panel-title">
        Семинар — {course?.short ?? seminar.courseId}
        {surname ? `, ${surname}` : ''}
      </div>

      {seminar.speech ? (
        <SpeechResult speech={seminar.speech} />
      ) : seminar.canSpeak && seminar.options.length > 0 ? (
        <>
          <div className="seminar__prompt">Поднять руку?</div>
          {seminar.options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="hud__menu-item seminar__option"
              onClick={() => world.commandSpeakAtSeminar(option.id)}
            >
              <span className="seminar__option-label">{option.label}</span>
              <span className="seminar__option-hint">{option.hint}</span>
            </button>
          ))}
        </>
      ) : (
        <div className="seminar__closed">
          {seminar.reason ?? 'Сегодня вам сказать нечего'}
        </div>
      )}
    </div>
  )
}
