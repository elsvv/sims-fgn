import { TEACHERS } from '../../content/people/teachers'
import type {
  ActiveChainInfo,
  ChainConsequenceInfo,
  ChainOptionInfo,
  ChainOutcomeInfo,
} from '../../sim/World'
import { useWorld, useWorldSnapshot } from '../useWorld'

/** Как собеседника зовут в лицо: имя и отчество после фамилии, как в ведомости. */
function speakerName(speakerId: string): string {
  return TEACHERS[speakerId]?.name ?? speakerId
}

/**
 * Тон реплики.
 *
 * Это подсказка о характере фразы, а не о её цене. Игрок должен понимать,
 * что дерзость — это дерзость, и не должен догадываться, сколько она стоит
 * в баллах: как только под кнопкой появляется «+8», разговор превращается
 * в арифметику, а сцена — в таблицу.
 */
function ToneBadge({ option }: { option: ChainOptionInfo }) {
  return (
    <span className="conversation__tone" data-tone={option.tone} title={option.toneHint}>
      {option.toneLabel}
    </span>
  )
}

/**
 * Что произошло после выбора — человеческой фразой и неброской стрелкой.
 *
 * Стрелка нужна: без указателя направления игрок читает «Он оценил, что вы
 * не стали юлить» и не понимает, стало ли лучше. Одна стрелка — чуть
 * заметно, три — сильно; чисел нет нигде.
 */
function Consequence({ consequence }: { consequence: ChainConsequenceInfo }) {
  return (
    <div className="conversation__consequence">
      <div className="conversation__reason">{consequence.reason}</div>
      {consequence.changes.map((change) => (
        <div className="conversation__change" key={change.dimension + change.label}>
          <span className="conversation__change-text">{change.text}</span>
          <span
            className={`conversation__marker conversation__marker--${change.direction}`}
          >
            {change.marker}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Экран итога: чем всё кончилось и что это значило. */
function Outcome({ outcome }: { outcome: ChainOutcomeInfo }) {
  const world = useWorld()

  return (
    <div className="conversation__outcome">
      <div className="conversation__ending-title">{outcome.title}</div>
      <div className="conversation__ending-summary">{outcome.summary}</div>

      {outcome.changes.length > 0 && (
        <div className="conversation__totals">
          {outcome.changes.map((change) => (
            <div className="conversation__change" key={change.dimension + change.label}>
              <span className="conversation__change-text">{change.text}</span>
              <span
                className={`conversation__marker conversation__marker--${change.direction}`}
              >
                {change.marker}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="hud__menu-item dialogue__continue"
        onClick={() => world.endChainDialogue()}
      >
        Разойтись
      </button>
    </div>
  )
}

/**
 * Ответы игрока.
 *
 * Закрытые реплики показываются серыми, а не прячутся. Спрятанная реплика —
 * это реплика, которой для игрока не существует: он никогда не узнает, что
 * латынь открывала здесь отдельную ветку, и решит, что сцена маленькая.
 * Серая строка с намёком «нужны древние языки» говорит обратное — сцена
 * больше, чем вы к ней готовы, — и это ровно то, ради чего в игре учатся.
 * Чего именно не хватает, сказано словами, без порогов и чисел.
 */
function Options({ options }: { options: ChainOptionInfo[] }) {
  const world = useWorld()

  return (
    <>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="hud__menu-item conversation__option"
          disabled={!option.available}
          onClick={() => world.chooseChainOption(option.id)}
        >
          <span className="conversation__option-head">
            <ToneBadge option={option} />
            {option.lockHint && <span className="conversation__lock">{option.lockHint}</span>}
          </span>
          <span className="conversation__option-text">{option.text}</span>
        </button>
      ))}
    </>
  )
}

/**
 * Окно многошагового разговора.
 *
 * Ведёт сцену целиком: реплика собеседника — выбор ответа — реакция и её
 * последствие — снова реплика, и так до концовки с названием. Экран за раз
 * показывает что-нибудь одно: пока на нём ответ собеседника, вариантов нет,
 * а пока есть варианты — нет ответа. Иначе всё это сливается в стену текста,
 * из которой игрок вылавливает только кнопки.
 *
 * Панель стоит внизу по центру, между панелями нужд и навыков: часы в правом
 * верхнем углу она не закрывает никогда, и время до пары видно, не выходя
 * из разговора. Это важнее, чем кажется: сцена «Марей в туалете» идёт ровно
 * в те минуты, когда у обоих скоро пара.
 */
function Conversation({ chain }: { chain: ActiveChainInfo }) {
  const world = useWorld()

  return (
    <div className="hud__panel hud__conversation">
      <div className="conversation__speaker">{speakerName(chain.speakerId)}</div>

      {chain.intro && <div className="conversation__intro">{chain.intro}</div>}

      {/*
        На экране всегда что-нибудь одно: либо реплика, на которую игрок
        отвечает, либо реакция собеседника на уже сказанное. Показывать
        и то и другое сразу нельзя — читаться это будет задом наперёд.
      */}
      {chain.prompt !== null && <div className="conversation__prompt">{chain.prompt}</div>}

      {chain.reply && <div className="conversation__reply">{chain.reply}</div>}

      {chain.consequence && <Consequence consequence={chain.consequence} />}

      {chain.awaitingContinue ? (
        <button
          type="button"
          className="hud__menu-item dialogue__continue"
          onClick={() => world.continueChainDialogue()}
        >
          Дальше
        </button>
      ) : chain.outcome ? (
        <Outcome outcome={chain.outcome} />
      ) : (
        <>
          <Options options={chain.options} />
          {/*
            Уйти можно в любой момент. Молчание — тоже поведение, и человек,
            которого вы окликнули у двери туалета, имеет полное право
            остаться без ответа.
          */}
          <button
            type="button"
            className="hud__menu-item hud__menu-item--cancel"
            onClick={() => world.endChainDialogue()}
          >
            Уйти, не договорив
          </button>
        </>
      )}
    </div>
  )
}

export function ConversationPanel() {
  const { activeChain } = useWorldSnapshot()
  if (!activeChain) return null
  return <Conversation chain={activeChain} />
}
