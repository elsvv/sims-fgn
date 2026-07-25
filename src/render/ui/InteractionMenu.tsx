import { minutesUntilMorning } from '../../sim/daily/DayCycle'
import { describeWait } from '../../sim/text/russian'
import { useWorld, useWorldSnapshot } from '../useWorld'

/**
 * Начиная с какой длины сна игрока надо предупредить.
 *
 * Сон в этой игре один — до утра, — и вечером это ровно то, чего игрок
 * хочет. Но кнопка стоит в меню скамейки круглые сутки, и нажатая в восемь
 * утра она отправляет спать двадцать три часа: день пропадает целиком,
 * все пары уходят в прогулы, а нужды к утру на нуле. Механику это не
 * ломает — «до утра» честно означает именно это, — но узнать об этом
 * из подписи «до утра» нельзя, и первым, кто на это наступил, был
 * проверяльщик, лёгший на скамейку в четверть восьмого утра.
 *
 * Тринадцать часов — это отход ко сну в шесть вечера. Раньше — уже не
 * «лечь спать», а «вычеркнуть день».
 */
const LONG_SLEEP_MINUTES = 13 * 60

export function InteractionMenu({
  propId,
  onClose,
}: {
  propId: string | null
  onClose: () => void
}) {
  const world = useWorld()
  const snapshot = useWorldSnapshot()
  if (!propId) return null

  const placement = world.plan.props.find((p) => p.id === propId)
  const definition = placement ? world.catalog[placement.kind] : undefined
  // На чём спят, знает не каталог предметов, а каталог мест для сна:
  // «лечь спать» — это конец дня, а не действие с предметом, и путать
  // их в одном списке нельзя, даже когда они в одном меню.
  const sleepSpot = world.sleepSpotFor(propId)
  if (!placement || !definition) return null
  if (definition.interactions.length === 0 && !sleepSpot) return null

  return (
    <div className="hud__panel hud__menu">
      <div className="hud__menu-title">{definition.label}</div>
      {definition.interactions.map((interaction) => (
        <button
          key={interaction.id}
          type="button"
          className="hud__menu-item"
          onClick={() => {
            world.commandInteract(propId, interaction.id)
            onClose()
          }}
        >
          <span>{interaction.label}</span>
          <span className="hud__menu-time">{interaction.durationMinutes} мин</span>
        </button>
      ))}
      {sleepSpot && (
        <button
          type="button"
          className="hud__menu-item hud__menu-item--sleep"
          onClick={() => {
            world.commandSleep(propId)
            onClose()
          }}
        >
          <span className="hud__menu-line">
            <span>{sleepSpot.actionLabel}</span>
            <span className="hud__menu-time">до утра</span>
          </span>
          {minutesUntilMorning(snapshot.minutes) > LONG_SLEEP_MINUTES && (
            <span className="hud__menu-note">
              Сейчас день: проспите {describeWait(minutesUntilMorning(snapshot.minutes))} и
              пропустите всё сегодняшнее расписание
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        className="hud__menu-item hud__menu-item--cancel"
        onClick={onClose}
      >
        Отмена
      </button>
    </div>
  )
}
