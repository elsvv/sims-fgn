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
  if (!placement || !definition || definition.interactions.length === 0) return null

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
