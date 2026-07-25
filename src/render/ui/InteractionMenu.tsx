import { useWorld } from '../useWorld'

export function InteractionMenu({
  propId,
  onClose,
}: {
  propId: string | null
  onClose: () => void
}) {
  const world = useWorld()
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
          <span>{sleepSpot.actionLabel}</span>
          <span className="hud__menu-time">до утра</span>
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
