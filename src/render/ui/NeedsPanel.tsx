import { NEED_IDS, NEED_LABELS, needSatisfaction } from '../../sim/needs/needs'
import { useWorldSnapshot } from '../useWorld'

function barColor(satisfaction: number): string {
  if (satisfaction > 60) return '#5cb974'
  if (satisfaction > 30) return '#d9a441'
  return '#d4574e'
}

function moodLabel(mood: number): string {
  if (mood > 80) return 'Отличное настроение'
  if (mood > 60) return 'Нормально'
  if (mood > 40) return 'Так себе'
  if (mood > 20) return 'Плохо'
  return 'Совсем скверно'
}

export function NeedsPanel() {
  const snapshot = useWorldSnapshot()

  return (
    <div className="hud__panel hud__needs">
      {NEED_IDS.map((id) => {
        const satisfaction = needSatisfaction(id, snapshot.needs[id])
        return (
          <div className="need" key={id}>
            <div className="need__label">
              <span>{NEED_LABELS[id]}</span>
              <span>{Math.round(satisfaction)}</span>
            </div>
            <div className="need__track">
              <div
                className="need__fill"
                style={{ width: `${satisfaction}%`, background: barColor(satisfaction) }}
              />
            </div>
          </div>
        )
      })}
      <div className="hud__mood">{moodLabel(snapshot.mood)}</div>
    </div>
  )
}
