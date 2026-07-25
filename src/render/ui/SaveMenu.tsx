import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applySave, createSave } from '../../sim/save/SaveGame'
import type { Speed } from '../../sim/time/GameClock'
import { autoSave, browserStorage, SaveStorage, slotLabel, type SlotInfo } from '../save/SaveStorage'
import { useRestartWorld, useWorld, useWorldSnapshot } from '../useWorld'

/**
 * Меню игры: сохранения, загрузка и «начать заново».
 *
 * Пока меню открыто, время стоит. Это не украшение: список слотов читают
 * не торопясь, а персонаж в это время продолжал бы голодать, опаздывать
 * на пару и стареть на глазах. Закрыв меню, игрок возвращается к той же
 * скорости, на которой играл.
 */

/** Строчка слота: подпись, что в нём лежит и что с ним можно сделать. */
function SlotRow({
  slot,
  disabled,
  onSave,
  onLoad,
  onErase,
}: {
  slot: SlotInfo
  disabled: boolean
  onSave: (slotId: string) => void
  onLoad: (slotId: string) => void
  onErase: (slotId: string) => void
}) {
  const filled = slot.meta !== null

  return (
    <div className="saveslot" data-empty={!filled && slot.problem === null}>
      <div className="saveslot__body">
        <div className="saveslot__label">{slot.label}</div>
        <div className="saveslot__when">
          {slot.problem ??
            (slot.meta
              ? `${slot.progressLabel} · сохранено ${slot.savedAtLabel}`
              : 'Пусто')}
        </div>
      </div>

      <div className="saveslot__actions">
        {/* В слот автосохранения игра пишет сама: рукой туда класть нечего,
            иначе он перестанет быть тем, к чему всегда можно откатиться. */}
        {!slot.auto && (
          <button
            type="button"
            className="saveslot__button"
            disabled={disabled}
            onClick={() => onSave(slot.id)}
          >
            {filled ? 'Перезаписать' : 'Сохранить'}
          </button>
        )}
        <button
          type="button"
          className="saveslot__button"
          disabled={disabled || !filled}
          onClick={() => onLoad(slot.id)}
        >
          Загрузить
        </button>
        {!slot.auto && filled && (
          <button
            type="button"
            className="saveslot__button saveslot__button--quiet"
            disabled={disabled}
            onClick={() => onErase(slot.id)}
          >
            Стереть
          </button>
        )}
      </div>
    </div>
  )
}

export function SaveMenu() {
  const world = useWorld()
  const snapshot = useWorldSnapshot()
  const restartWorld = useRestartWorld()

  const storage = useMemo(() => {
    const browser = browserStorage()
    return browser ? new SaveStorage(browser) : null
  }, [])

  const [open, setOpen] = useState(false)
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmingRestart, setConfirmingRestart] = useState(false)

  /** Скорость, на которой играли до открытия меню. */
  const speedBefore = useRef<Speed>(1)
  /** День, на котором игра была в прошлый раз: по его смене идёт автосохранение. */
  const lastDay = useRef<number | null>(null)

  const refresh = useCallback(() => {
    setSlots(storage ? storage.list() : [])
  }, [storage])

  // Автосохранение при смене дня. Когда именно и куда писать, решает
  // autoSave — здесь остаётся только показать обновившийся список.
  useEffect(() => {
    if (autoSave(storage, world, lastDay.current, snapshot.day, Date.now())) refresh()
    lastDay.current = snapshot.day
  }, [snapshot.day, storage, world, refresh])

  function openMenu(): void {
    speedBefore.current = world.clock.speed
    world.clock.speed = 0
    setNotice(null)
    setConfirmingRestart(false)
    refresh()
    setOpen(true)
  }

  function closeMenu(): void {
    // Возвращаемся к той скорости, на которой играли. Загруженное сохранение
    // помнит свою, но игрок помнит свою — и его ожидание здесь важнее.
    world.clock.speed = speedBefore.current
    setOpen(false)
  }

  function saveTo(slotId: string): void {
    if (!storage) return
    const result = storage.write(slotId, createSave(world, Date.now()))
    setNotice(
      result.ok
        ? `Игра сохранена: ${slotLabel(slotId)}.`
        : `Сохранить не вышло — ${result.reason}`,
    )
    refresh()
  }

  function loadFrom(slotId: string): void {
    if (!storage) return
    try {
      const save = storage.read(slotId)
      if (!save) {
        setNotice('В этом слоте ничего нет.')
        return
      }
      applySave(world, save)
      closeMenu()
    } catch (error) {
      // Внятная причина уже написана по-русски внутри ошибки: чужая версия
      // схемы или испорченный файл.
      setNotice(error instanceof Error ? error.message : 'Сохранение не читается.')
      refresh()
    }
  }

  function eraseSlot(slotId: string): void {
    if (!storage) return
    storage.remove(slotId)
    setNotice(`${slotLabel(slotId)} стёрт.`)
    refresh()
  }

  function restart(): void {
    // Счётчик дня сбрасывается вместе с миром: иначе первый же кадр новой
    // партии увидел бы смену дня и затёр автосохранение прошлой.
    lastDay.current = null
    restartWorld()
    setConfirmingRestart(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button type="button" className="hud__gamemenu" onClick={openMenu}>
        Меню
      </button>
    )
  }

  return (
    <div className="savemenu">
      <div className="savemenu__card">
        <div className="dayscreen__kicker">Игра</div>
        <div className="savemenu__title">Сохранения</div>

        {storage === null && (
          <p className="dayscreen__note">
            Браузер не разрешает хранить сохранения — похоже, включён приватный режим.
            Играть можно, но прогресс не переживёт закрытия вкладки.
          </p>
        )}

        <div className="savemenu__slots">
          {slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              disabled={storage === null}
              onSave={saveTo}
              onLoad={loadFrom}
              onErase={eraseSlot}
            />
          ))}
        </div>

        {notice && <p className="savemenu__notice">{notice}</p>}

        {confirmingRestart ? (
          <div className="savemenu__confirm">
            <p className="savemenu__confirm-text">
              Начать заново? Текущий модуль пропадёт целиком: оценки, отношения,
              прочитанное и всё, что вы наговорили. Сохранения в слотах останутся.
            </p>
            <div className="savemenu__buttons">
              <button
                type="button"
                className="savemenu__button savemenu__button--danger"
                onClick={restart}
              >
                Да, начать заново
              </button>
              <button
                type="button"
                className="savemenu__button"
                onClick={() => setConfirmingRestart(false)}
              >
                Нет, вернуться
              </button>
            </div>
          </div>
        ) : (
          <div className="savemenu__buttons">
            <button
              type="button"
              className="savemenu__button savemenu__button--quiet"
              onClick={() => setConfirmingRestart(true)}
            >
              Начать заново
            </button>
            <button type="button" className="savemenu__button" onClick={closeMenu}>
              Вернуться в игру
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
