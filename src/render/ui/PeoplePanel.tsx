import { TEACHERS } from '../../content/people/teachers'
import { ANALYTIC, CONTINENTAL } from '../../sim/social/Faction'
import { standingOf } from '../../sim/social/Relationship'
import type { RelationshipInfo } from '../../sim/World'
import { useWorldSnapshot } from '../useWorld'

/** Фамилия для строки списка. У человека без карточки остаётся его идентификатор. */
function nameOf(record: RelationshipInfo): string {
  if (!record.teacherId) return record.npcId
  return TEACHERS[record.teacherId]?.short ?? record.npcId
}

/**
 * С кем уже что-то произошло. Незнакомых в списке нет — иначе он вечно полон.
 *
 * Двух условий, а не одного: разговор бывает и без последствий. Игрок,
 * ответивший преподавателю «просто жду пару», выходил из окна разговора
 * и читал под ним «вы ещё ни с кем не говорили» — панель называла ложью
 * то, что он только что сделал на своих глазах.
 */
function isKnown(record: RelationshipInfo): boolean {
  return record.met || standingOf(record).length > 0
}

/**
 * Один человек: фамилия, оценка отношений и по фразе на каждое измерение.
 *
 * Ни одного числа. «+8 / −6» — это отчёт для того, кто знает шкалу, а шкалы
 * у отношений нет ни в жизни, ни в игре: за эти восемь единиц симпатии
 * игрок нигде не расплачивался и ни с чем их не сравнит. Слова говорят то
 * же самое и говорят понятно, а величину показывают стрелки — теми же,
 * какими подписаны последствия реплик в окне разговора.
 */
function Person({ record }: { record: RelationshipInfo }) {
  const standings = standingOf(record)

  return (
    <div className="person">
      <div className="person__head">
        <span className="person__name">{nameOf(record)}</span>
        <span className="person__level">{record.label}</span>
      </div>
      {standings.length === 0 ? (
        // Разговор был, а следа не оставил. Пустая строка на этом месте
        // читалась бы как недогруженные данные, поэтому молчание названо
        // вслух — и без чисел, как всё остальное в панели.
        <div className="person__standing">
          <span className="person__standing-text">Поговорили, и только</span>
        </div>
      ) : (
        standings.map((standing) => (
          <div className="person__standing" key={standing.dimension}>
            <span className="person__standing-text">{standing.text}</span>
            <span className={`person__marker person__marker--${standing.direction}`}>
              {standing.marker}
            </span>
          </div>
        ))
      )}
    </div>
  )
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
        known.map((record) => <Person record={record} key={record.npcId} />)
      )}
    </div>
  )
}
