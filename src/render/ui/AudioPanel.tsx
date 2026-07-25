import { useState } from 'react'
import { useAudioControls } from '../audio/useGameAudio'
import { AUDIO_BUSES, BUS_LABELS, type AudioBus } from '../audio/settings'

/**
 * Панель звука.
 *
 * Стоит у левого края посередине — единственное место экрана, за которое
 * ни с кем не спорит: сверху расписание, снизу нужды, справа внизу навыки,
 * а окна разговоров и панель семинара нарочно оставляют по 270 пикселей
 * с каждого края (см. max-width у .hud__conversation).
 *
 * Свёрнута по умолчанию, и это не экономия места. Звуком пользуются
 * дважды: один раз в начале, чтобы сделать потише, и один раз, чтобы
 * выключить совсем. Четыре ползунка, висящие на экране постоянно, —
 * это четыре ползунка, которые игрок перестаёт видеть на третьей минуте.
 */

/** Громкость словами игрока: та же шкала, что у полосок нужд. */
function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function VolumeRow({
  bus,
  value,
  disabled,
  onChange,
}: {
  bus: AudioBus
  value: number
  disabled: boolean
  onChange: (bus: AudioBus, value: number) => void
}) {
  return (
    <label className="audio__row">
      <span className="audio__name">{BUS_LABELS[bus]}</span>
      <input
        className="audio__slider"
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(event) => onChange(bus, Number(event.target.value) / 100)}
      />
      <span className="audio__value">{percent(value)}</span>
    </label>
  )
}

export function AudioPanel() {
  const { settings, setEnabled, setVolume, ready } = useAudioControls()
  const [open, setOpen] = useState(false)

  return (
    <div className="hud__audio">
      <button
        type="button"
        className="audio__toggle"
        data-off={!settings.enabled}
        title={settings.enabled ? 'Настройки звука' : 'Звук выключен'}
        onClick={() => setOpen(!open)}
      >
        {settings.enabled ? '♪ Звук' : '✕ Звук'}
      </button>

      {open && (
        <div className="hud__panel audio__panel">
          <div className="hud__panel-title">Звук</div>

          <button
            type="button"
            className="audio__switch"
            data-on={settings.enabled}
            onClick={() => setEnabled(!settings.enabled)}
          >
            {settings.enabled ? 'Включён' : 'Выключен'}
          </button>

          {AUDIO_BUSES.map((bus) => (
            <VolumeRow
              key={bus}
              bus={bus}
              value={settings[bus]}
              disabled={!settings.enabled}
              onChange={setVolume}
            />
          ))}

          {/*
            Браузер не включает звук, пока человек ничего не нажал. Пока
            разрешения нет, панель говорит об этом сама: молчащая игра
            с исправными ползунками читается как поломка.
          */}
          {settings.enabled && !ready && (
            <div className="hud__hint">
              Браузер включит звук после первого нажатия — щёлкните где угодно.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
