import type {
  DayScreenInfo,
  WeekendOptionInfo,
} from '../../sim/World'
import type { DaySummary } from '../../sim/daily/DaySummary'
import type { WeekendReport } from '../../sim/daily/Weekend'
import type { EpilogueReport } from '../../sim/epilogue/Epilogue'
import { useWorld, useWorldSnapshot } from '../useWorld'

/**
 * Экраны, которыми кончается день.
 *
 * Все три занимают экран целиком и останавливают время: итоги прожитого дня,
 * карточка воскресенья и эпилог модуля — это моменты, когда игрок не в мире,
 * а над ним. Панели нужд, расписания и часов под ними не нужны и мешают:
 * читать рассказ о прожитом дне поверх полоски мочевого пузыря невозможно.
 */

/** Итоги дня: короткий рассказ и кнопка «Дальше». */
function DaySummaryScreen({ summary }: { summary: DaySummary }) {
  const world = useWorld()

  return (
    <div className="dayscreen__card">
      <div className="dayscreen__kicker">День прожит</div>
      <div className="dayscreen__title">{summary.title}</div>
      {summary.paragraphs.map((paragraph) => (
        <p className="dayscreen__text" key={paragraph}>
          {paragraph}
        </p>
      ))}
      <button
        type="button"
        className="hud__menu-item dayscreen__continue"
        onClick={() => world.dismissDaySummary()}
      >
        Дальше
      </button>
    </div>
  )
}

/**
 * Карточка воскресенья.
 *
 * Дизайн-документ, §3: единственный выходной в 3D не отыгрывается. Игрок
 * выбирает, как его провести, и день прокручивается. Под каждым вариантом
 * написано, что он значит, — но не написано, что он стоит: выходной
 * выбирают по тому, чего хочется, а не по таблице приращений.
 */
function WeekendChoice({ options }: { options: WeekendOptionInfo[] }) {
  const world = useWorld()

  return (
    <div className="dayscreen__card">
      <div className="dayscreen__kicker">Воскресенье</div>
      <div className="dayscreen__title">Единственный выходной за неделю</div>
      <p className="dayscreen__text">
        Учебная неделя здесь шестидневная: с понедельника по субботу. Воскресенье одно,
        и потратить его можно только на что-нибудь одно.
      </p>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className="hud__menu-item dayscreen__option"
          onClick={() => world.chooseWeekendOption(option.id)}
        >
          <span className="dayscreen__option-title">{option.title}</span>
          <span className="dayscreen__option-hint">{option.description}</span>
        </button>
      ))}
    </div>
  )
}

/** Чем кончился выходной. */
function WeekendOutcome({ report }: { report: WeekendReport }) {
  const world = useWorld()

  return (
    <div className="dayscreen__card">
      <div className="dayscreen__kicker">Воскресенье</div>
      <div className="dayscreen__title">{report.title}</div>
      <p className="dayscreen__text">{report.outcome}</p>

      {report.notes.map((note) => (
        <p className="dayscreen__note" key={note}>
          {note}
        </p>
      ))}

      {report.changes.length > 0 && (
        <div className="dayscreen__changes">
          {report.changes.map((change) => (
            <div className="conversation__change" key={change.dimension + change.label}>
              <span className="conversation__change-text">{change.text}</span>
              <span className={`conversation__marker conversation__marker--${change.direction}`}>
                {change.marker}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="hud__menu-item dayscreen__continue"
        onClick={() => world.dismissWeekendReport()}
      >
        Наступает понедельник
      </button>
    </div>
  )
}

/**
 * Эпилог.
 *
 * Дизайн-документ, §9: не экран победы, а рассказ о том, кем ты стал.
 * Поэтому сначала название концовки и её текст, и только под ними — сводка
 * модуля. Кнопки «дальше» здесь нет: дальше ничего нет.
 */
function EpilogueScreen({ epilogue }: { epilogue: EpilogueReport }) {
  return (
    <div className="dayscreen__card dayscreen__card--epilogue">
      <div className="dayscreen__kicker">Модуль окончен</div>
      <div className="dayscreen__title dayscreen__title--epilogue">{epilogue.title}</div>
      <p className="dayscreen__story">{epilogue.story}</p>

      <div className="dayscreen__ledger">
        {epilogue.paragraphs.map((paragraph) => (
          <p className="dayscreen__text" key={paragraph}>
            {paragraph}
          </p>
        ))}
      </div>
    </div>
  )
}

function Screen({ screen }: { screen: DayScreenInfo }) {
  if (screen.kind === 'epilogue' && screen.epilogue) {
    return <EpilogueScreen epilogue={screen.epilogue} />
  }
  if (screen.kind === 'summary' && screen.summary) {
    return <DaySummaryScreen summary={screen.summary} />
  }
  if (screen.weekendReport) return <WeekendOutcome report={screen.weekendReport} />
  if (screen.weekendOptions.length > 0) return <WeekendChoice options={screen.weekendOptions} />
  return null
}

export function DayScreen() {
  const { dayScreen } = useWorldSnapshot()
  if (!dayScreen) return null

  return (
    <div className="dayscreen">
      <Screen screen={dayScreen} />
    </div>
  )
}
