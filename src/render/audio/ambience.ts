import type { AmbienceId } from './catalog'

/**
 * Какой воздух в помещении.
 *
 * Чистая функция от обстановки: комната, идёт ли в ней пара, скоро ли
 * звонок, ночь ли на дворе. Никакого Web Audio, никакого React — поэтому
 * правило «в туалете кафель, а в коридоре перед парой гомон» проверяется
 * тестом, а не ушами.
 */

/** Обстоятельства, от которых зависит слой атмосферы. */
export interface AmbienceSituation {
  /** Помещение игрока из снимка мира. null — в дверях или в стене. */
  readonly room: string | null
  /** Идёт ли пара в этом самом помещении прямо сейчас. */
  readonly lessonHere: boolean
  /** Через сколько минут ближайший звонок. null — пар сегодня больше нет. */
  readonly minutesToLesson: number | null
  /** Ночь: этаж пуст, гомону взяться неоткуда. */
  readonly night: boolean
}

/**
 * За сколько минут до пары коридор наполняется людьми.
 *
 * Двадцать — это перемена целиком: пары в ВШЭ идут парами по 80 минут
 * с перерывом, и всё это время коридор занят теми, кто вышел из одной
 * аудитории и ещё не зашёл в другую.
 */
export const BUSY_BEFORE_LESSON_MINUTES = 20

/**
 * Помещения, у которых свой слой независимо от расписания.
 * Ключ — идентификатор комнаты из планировки (src/content/floors/floorA2.ts).
 */
const FIXED_ROOMS: Readonly<Record<string, AmbienceId>> = {
  туалеты: 'toilet',
  'лифтовый холл': 'elevator-hall',
  коридор: 'corridor',
}

/**
 * Аудитория опознаётся по номеру, а не по списку.
 *
 * Нумерация корпуса — «буква корпуса, дефис, этаж и порядковый номер»
 * (research/building.md), поэтому «А-204» и «А-206» — это правило, а не
 * два частных случая. Достроенный третий этаж принесёт «А-3xx», и они
 * зазвучат аудиториями сами, без правки этого файла.
 */
const AUDITORIUM = /^[А-Я]-\d+$/u

export function isAuditorium(room: string): boolean {
  return AUDITORIUM.test(room)
}

/**
 * Слой атмосферы для текущей обстановки.
 *
 * `previous` — то, что играет сейчас. Оно возвращается, когда игрок стоит
 * в дверном проёме: проёмы нарочно не принадлежат никакому помещению
 * (см. floorA2.ts), и без этого правила каждый вход в аудиторию давал бы
 * секунду тишины посреди перехода — слышно и глупо.
 */
export function ambienceFor(
  situation: AmbienceSituation,
  previous: AmbienceId | null = null,
): AmbienceId | null {
  const { room } = situation
  if (room === null) return previous

  if (isAuditorium(room)) return situation.lessonHere ? 'lecture-class' : 'lecture'

  const fixed = FIXED_ROOMS[room]
  if (fixed === undefined) return previous

  if (fixed !== 'corridor') return fixed
  return crowdedCorridor(situation) ? 'corridor-busy' : 'corridor'
}

/** Гомон в коридоре стоит перед парой и в перемену, но не ночью. */
function crowdedCorridor(situation: AmbienceSituation): boolean {
  if (situation.night) return false
  const { minutesToLesson } = situation
  if (minutesToLesson === null) return false
  return minutesToLesson >= 0 && minutesToLesson <= BUSY_BEFORE_LESSON_MINUTES
}
