import { TEACHERS } from '../../content/people/teachers'
import { ANALYTIC, CONTINENTAL } from '../../sim/social/Faction'
import type { RelationshipInfo } from '../../sim/World'
import { useWorldSnapshot } from '../useWorld'

/** Фамилия для строки списка. У человека без карточки остаётся его идентификатор. */
function nameOf(record: RelationshipInfo): string {
  if (!record.teacherId) return record.npcId
  return TEACHERS[record.teacherId]?.short ?? record.npcId
}

/** Знак у числа: «+8», «−6», «0». */
function signed(value: number): string {
  const rounded = Math.round(value)
  if (rounded > 0) return `+${rounded}`
  if (rounded < 0) return `−${Math.abs(rounded)}`
  return '0'
}

/** С кем уже что-то произошло. Незнакомых в списке нет — иначе он вечно полон. */
function isKnown(record: RelationshipInfo): boolean {
  return Math.round(record.affection) !== 0 || Math.round(record.respect) !== 0
}

/**
 * Положение метки на шкале традиций в процентах ширины.
 * Слева аналитическая традиция, справа континентальная.
 */
function scaleOffset(faction: number): number {
  return ((faction - ANALYTIC) / (CONTINENTAL - ANALYTIC)) * 100
}

/**
 * Люди и шкала традиций.
 *
 * Обе половины отвечают на один вопрос: кем ты становишься в чужих глазах.
 * Шкала показывает, куда тебя сносит от разговора к разговору, список —
 * во что это обошлось. Всеобщим любимцем стать нельзя, и панель должна
 * показывать цену выбора, а не только его результат.
 */
export function PeoplePanel() {
  const snapshot = useWorldSnapshot()
  const known = snapshot.relationships.filter(isKnown)

  return (
    <div className="hud__panel hud__people">
      <div className="hud__panel-title">Шкала традиций</div>

      <div className="faction__scale">
        <div className="faction__track">
          <div className="faction__middle" />
          <div className="faction__mark" style={{ left: `${scaleOffset(snapshot.faction)}%` }} />
        </div>
        <div className="faction__ends">
          <span>аналитики</span>
          <span>континентальные</span>
        </div>
      </div>

      <div className="faction__label">{snapshot.factionLabel}</div>

      <div className="hud__panel-title hud__section">Люди</div>

      {known.length === 0 ? (
        <div className="hud__hint">
          Вы ещё ни с кем не говорили. Нажмите на преподавателя в коридоре.
        </div>
      ) : (
        known.map((record) => (
          <div className="person" key={record.npcId}>
            <span className="person__name">{nameOf(record)}</span>
            <span className="person__level">{record.label}</span>
            <span className="person__scores" title="симпатия и уважение">
              {signed(record.affection)} / {signed(record.respect)}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
