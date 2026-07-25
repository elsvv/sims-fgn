import { TEACHERS } from '../../content/people/teachers'
import { useWorld, useWorldSnapshot } from '../useWorld'

/** Как к собеседнику обращаются вслух. Незнакомого зовут по идентификатору. */
function speakerName(speakerId: string): string {
  return TEACHERS[speakerId]?.name ?? speakerId
}

/**
 * Окно разговора.
 *
 * Пока игрок не ответил, видны реплика собеседника и список доступных
 * ответов. После выбора список сменяется одним ответом собеседника
 * и кнопкой «Продолжить»: разговор — это ход, а не переписка, и вернуться
 * и переиграть его нельзя.
 *
 * Кнопка выхода есть всегда: игрок должен иметь возможность отойти,
 * ничего не сказав, — молчание тоже поведение.
 */
export function DialoguePanel() {
  const world = useWorld()
  const { activeDialogue } = useWorldSnapshot()
  if (!activeDialogue) return null

  const { reply, options } = activeDialogue

  return (
    <div className="hud__panel hud__dialogue">
      <div className="dialogue__speaker">{speakerName(activeDialogue.speakerId)}</div>
      <div className="dialogue__prompt">{activeDialogue.prompt}</div>

      {reply === null ? (
        <>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className="hud__menu-item dialogue__option"
              onClick={() => world.chooseOption(option.id)}
            >
              {option.text}
            </button>
          ))}
          <button
            type="button"
            className="hud__menu-item hud__menu-item--cancel"
            onClick={() => world.endDialogue()}
          >
            Промолчать и отойти
          </button>
        </>
      ) : (
        <>
          <div className="dialogue__reply">{reply}</div>
          <button
            type="button"
            className="hud__menu-item dialogue__continue"
            onClick={() => world.endDialogue()}
          >
            Продолжить
          </button>
        </>
      )}
    </div>
  )
}
