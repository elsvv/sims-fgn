import { useEffect, useState } from 'react'
import { useWorldSnapshot } from '../useWorld'

/**
 * Что делать в первую минуту игры.
 *
 * Проверка глазами показала главное: игра начинается с человека, стоящего
 * посреди коридора, и ни одна панель не отвечает на вопрос «а дальше?».
 * Управление здесь не общепринятое — вид вращают той же кнопкой, которой
 * ходят, — и угадать это неоткуда: до порога перетаскивания протяжка
 * ничего не делает, а после него не идёт персонаж.
 *
 * Поэтому четыре строчки: три про управление и одна про то, куда идти.
 * Не обучение с шагами и не модальное окно: оно бы остановило игру, а
 * первые полтора часа игрового времени до пары — это ровно то время,
 * когда осматриваются.
 *
 * Подсказка уходит сама, как только игрок сделал хоть что-нибудь: пошёл,
 * взялся за предмет, заговорил. Возвращать её незачем — в ней нет ничего,
 * чего игрок к тому моменту не сделал бы руками.
 */

/** Строки подсказки: слева действие, справа что произойдёт. */
const LINES: { how: string; what: string }[] = [
  { how: 'Потянуть мышью', what: 'повернуть вид. Колесо приближает' },
  { how: 'Щелчок по полу', what: 'идти туда' },
  { how: 'Щелчок по человеку', what: 'заговорить. Далеко — подойдёт сам' },
  { how: 'Щелчок по предмету', what: 'что с ним можно сделать' },
]

export function HintPanel() {
  const snapshot = useWorldSnapshot()
  const [gone, setGone] = useState(false)

  // Любое действие игрока: шаг, занятие, разговор. Флаг липкий —
  // иначе подсказка возвращалась бы каждый раз, когда персонаж встал.
  const acted =
    snapshot.isPlayerMoving ||
    snapshot.activity !== null ||
    snapshot.activeDialogue !== null ||
    snapshot.activeChain !== null ||
    snapshot.seminar !== null ||
    snapshot.dayScreen !== null

  useEffect(() => {
    if (acted) setGone(true)
  }, [acted])

  if (gone) return null

  return (
    <div className="hud__panel hud__hintcard">
      <div className="hud__panel-title">С чего начать</div>
      {LINES.map((line) => (
        <div className="hintcard__line" key={line.how}>
          <span className="hintcard__how">{line.how}</span>
          <span className="hintcard__what">— {line.what}</span>
        </div>
      ))}
      <div className="hintcard__goal">
        Первая пара в девять, аудитория написана в расписании слева. До звонка
        полтора часа: их есть чем занять.
      </div>
      <button
        type="button"
        className="hud__menu-item hintcard__close"
        onClick={() => setGone(true)}
      >
        Понятно
      </button>
    </div>
  )
}
