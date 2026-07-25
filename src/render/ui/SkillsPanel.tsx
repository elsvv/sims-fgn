import {
  MAX_SKILL,
  SKILL_IDS,
  SKILL_LABELS,
  SKILL_SOURCES,
  skillLevelLabel,
  type Skills,
} from '../../sim/player/Skills'
import { useWorldSnapshot } from '../useWorld'

/**
 * Цвет шкалы навыка. Золото начинается там же, где в ведомости:
 * девятка и десятка по правилам ВШЭ требуют результата,
 * превышающего программу, — и выглядеть должны иначе.
 */
function skillColor(value: number): string {
  if (value >= 9) return '#d9b45c'
  if (value >= 4) return '#5c85ea'
  return '#4d6ba8'
}

/** Число с одним знаком после запятой, как оценка в ведомости. */
function formatSkill(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/** Знак влияния модификатора: «+40», «−30». */
function formatMood(mood: number): string {
  return mood > 0 ? `+${mood}` : `−${Math.abs(mood)}`
}

function StrongestSkill({ skills }: { skills: Skills }) {
  const best = SKILL_IDS.reduce((top, id) => (skills[id] > skills[top] ? id : top))
  const value = skills[best]

  if (value <= 0) {
    return <div className="hud__hint">Пока ничего не умеет. Первый курс, первый модуль.</div>
  }

  return (
    <div className="hud__hint">
      Сильнее всего: {SKILL_LABELS[best].toLowerCase()} — {skillLevelLabel(value)}
    </div>
  )
}

/**
 * Навыки и модификаторы настроения.
 *
 * Обе половины отвечают на вопрос «что со мной происходит»: навыки —
 * медленный итог модуля, модификаторы — то, что случилось час назад
 * и ещё не отпустило. Панель занимает правый нижний угол: слева внизу
 * нужды, слева вверху расписание, справа вверху часы.
 */
export function SkillsPanel() {
  const snapshot = useWorldSnapshot()

  return (
    <div className="hud__panel hud__skills">
      <div className="hud__panel-title">Навыки</div>

      {SKILL_IDS.map((id) => {
        const value = snapshot.skills[id]
        return (
          <div className="skill" key={id} title={`${skillLevelLabel(value)}. ${SKILL_SOURCES[id]}`}>
            <div className="skill__head">
              <span className="skill__name">{SKILL_LABELS[id]}</span>
              <span className="skill__value">{formatSkill(value)}</span>
            </div>
            <div className="skill__track">
              <div
                className="skill__fill"
                style={{
                  width: `${(value / MAX_SKILL) * 100}%`,
                  background: skillColor(value),
                }}
              />
            </div>
          </div>
        )
      })}

      <StrongestSkill skills={snapshot.skills} />

      <div className="hud__panel-title hud__section">Настроение</div>

      {snapshot.activeMoodlets.length === 0 ? (
        <div className="moodlet__empty">Ничего особенного не случилось</div>
      ) : (
        snapshot.activeMoodlets.map((moodlet) => (
          <div className="moodlet" key={moodlet.id}>
            <span className="moodlet__label">{moodlet.label}</span>
            <span
              className={`moodlet__mood moodlet__mood--${moodlet.mood > 0 ? 'good' : 'bad'}`}
            >
              {formatMood(moodlet.mood)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
