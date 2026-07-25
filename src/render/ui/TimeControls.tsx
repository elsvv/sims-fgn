import { describeWait } from '../../sim/text/russian'
import type { Speed } from '../../sim/time/GameClock'
import { useWorld, useWorldSnapshot } from '../useWorld'

const SPEEDS: { value: Speed; label: string; title: string }[] = [
  { value: 0, label: '❚❚', title: 'Пауза' },
  { value: 1, label: '1×', title: 'Обычная скорость' },
  { value: 2, label: '2×', title: 'Быстро' },
  { value: 3, label: '3×', title: 'Очень быстро' },
]

/**
 * За сколько игровых минут до отбоя игрок узнаёт, что пора спать.
 *
 * Полтора часа — это время дойти до места, где можно лечь. Предупреждать
 * позже бессмысленно: персонаж всё равно вырубится там, где стоит.
 */
const CURFEW_WARNING_MINUTES = 90

export function TimeControls() {
  const world = useWorld()
  const snapshot = useWorldSnapshot()
  const untilCurfew = snapshot.minutesUntilCurfew

  return (
    <div className="hud__panel hud__time">
      <div className="hud__clock">{snapshot.timeLabel}</div>
      <div className="hud__day">{snapshot.dayLabel}</div>
      {/*
        «Ещё немного … : 88 мин» противоречило само себе: полтора часа —
        это не «немного». Величина теперь названа словом и стоит на месте
        «немного», а не приписана к нему числом.

        И главное — сказано, где лечь. Единственное место для сна на этаже
        стоит в восточном конце коридора и в стартовый кадр не попадает;
        без этой строчки о нём узнавали из утреннего «вы отключились там,
        где стояли».
      */}
      {untilCurfew > 0 && untilCurfew <= CURFEW_WARNING_MINUTES && (
        <div className="hud__curfew">
          Ещё {describeWait(untilCurfew)} — и вы уснёте прямо здесь
          {snapshot.sleepPlace ? `. Лечь можно ${snapshot.sleepPlace}` : ''}
        </div>
      )}
      <div className="speed-buttons">
        {SPEEDS.map((speed) => (
          <button
            key={speed.value}
            type="button"
            title={speed.title}
            data-active={snapshot.speed === speed.value}
            onClick={() => {
              world.clock.speed = speed.value
            }}
          >
            {speed.label}
          </button>
        ))}
      </div>
    </div>
  )
}
