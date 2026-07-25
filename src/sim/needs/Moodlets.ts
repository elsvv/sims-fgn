import { directionOf, type Direction, type Magnitude } from '../dialogue/Consequences'

/**
 * Модификаторы настроения — временные эффекты с текстом.
 * Дизайн-документ, раздел 4.2: это главный источник юмора и обратной
 * связи, поэтому у каждого есть подпись, которую игрок читает целиком.
 */
export interface Moodlet {
  id: string
  /** Подпись в интерфейсе, на русском. */
  label: string
  /** Сдвиг настроения. Может быть отрицательным. */
  mood: number
  /** Игровая минута с начала модуля, начиная с которой эффект не действует. */
  expiresAtMinute: number
}

/**
 * Заготовка модификатора в каталоге контента: длительность вместо
 * абсолютного срока, потому что каталог не знает, когда его применят.
 */
export interface MoodletSpec {
  id: string
  label: string
  mood: number
  /** Сколько игровых минут держится. */
  durationMinutes: number
}

export type MoodletCatalog = Record<string, MoodletSpec>

/**
 * Насколько сильно модификатор давит на настроение — словами.
 *
 * Вес модификатора числа не имеет: «−30» игроку ничего не говорит, потому
 * что не с чем сравнивать. «Сильно тянет вниз» говорит ровно то, что нужно
 * знать: опоздание к Марею испортит день целиком, а долгий гардероб —
 * не испортит. Шкала своя: в каталоге сдвиги лежат в пределах полусотни.
 */
export interface MoodWeight {
  direction: Direction
  magnitude: Magnitude
  /** «сильно тянет вниз», «чуть поднимает». */
  text: string
}

const WEIGHT_WORDS: Record<Exclude<Magnitude, 'none'>, { up: string; down: string }> = {
  slight: { up: 'чуть поднимает', down: 'чуть портит' },
  noticeable: { up: 'заметно поднимает', down: 'заметно портит' },
  strong: { up: 'сильно тянет вверх', down: 'сильно тянет вниз' },
}

const NO_WEIGHT = 'на настроении не сказывается'

function weightMagnitude(mood: number): Magnitude {
  const size = Math.abs(Math.round(mood))
  if (size === 0) return 'none'
  if (size <= 10) return 'slight'
  if (size <= 25) return 'noticeable'
  return 'strong'
}

export function moodWeight(mood: number): MoodWeight {
  const magnitude = weightMagnitude(mood)
  const direction = directionOf(mood)
  if (magnitude === 'none' || direction === 'flat') {
    return { direction: 'flat', magnitude: 'none', text: NO_WEIGHT }
  }
  const words = WEIGHT_WORDS[magnitude]
  return { direction, magnitude, text: direction === 'down' ? words.down : words.up }
}

/** Превращает заготовку в живой модификатор, отсчитывая срок от текущей минуты. */
export function moodletFrom(spec: MoodletSpec, currentMinute: number): Moodlet {
  return {
    id: spec.id,
    label: spec.label,
    mood: spec.mood,
    expiresAtMinute: currentMinute + spec.durationMinutes,
  }
}

/**
 * Список активных модификаторов настроения.
 *
 * Порядок хранения — порядок появления: свежие внизу, и панель показывает
 * их так же, как игрок их заработал.
 */
export class MoodletList {
  private items: Moodlet[] = []

  /**
   * Добавляет модификатор.
   *
   * Повторное добавление с тем же идентификатором не плодит дубли:
   * запись обновляется на месте. Срок берётся более поздний из двух —
   * второй кофе не должен укорачивать действие первого, а восьмиминутное
   * ожидание лифта не становится приятнее оттого, что случилось дважды.
   */
  add(moodlet: Moodlet): void {
    const index = this.items.findIndex((item) => item.id === moodlet.id)
    if (index === -1) {
      this.items.push({ ...moodlet })
      return
    }

    const existing = this.items[index]!
    this.items[index] = {
      ...moodlet,
      expiresAtMinute: Math.max(existing.expiresAtMinute, moodlet.expiresAtMinute),
    }
  }

  /** Убирает просроченные записи. Вызывается из тика мира. */
  prune(currentMinute: number): void {
    this.items = this.items.filter((item) => item.expiresAtMinute > currentMinute)
  }

  /** Модификаторы, действующие прямо сейчас. */
  active(currentMinute: number): Moodlet[] {
    return this.items
      .filter((item) => item.expiresAtMinute > currentMinute)
      .map((item) => ({ ...item }))
  }

  /** Суммарный сдвиг настроения. Просроченные не учитываются. */
  totalMood(currentMinute: number): number {
    let sum = 0
    for (const item of this.items) {
      if (item.expiresAtMinute > currentMinute) sum += item.mood
    }
    return sum
  }

  /**
   * Есть ли такая запись в списке.
   *
   * Отвечает про хранилище, а не про текущую минуту: просроченная,
   * но ещё не вычищенная запись здесь считается. Это безопасно ровно
   * потому, что мир вызывает prune каждый тик.
   */
  has(id: string): boolean {
    return this.items.some((item) => item.id === id)
  }

  /** Сколько записей хранится, включая просроченные до ближайшего prune. */
  get size(): number {
    return this.items.length
  }

  /** Убирает запись досрочно — например, когда эффект отменён событием. */
  remove(id: string): void {
    this.items = this.items.filter((item) => item.id !== id)
  }

  clear(): void {
    this.items = []
  }

  toJSON(): Moodlet[] {
    return this.items.map((item) => ({ ...item }))
  }

  /**
   * Возвращает состояние на место, в уже существующий список.
   *
   * Не через add: тот сливает одинаковые записи и берёт больший срок,
   * а загрузка сохранения обязана воспроизвести список ровно таким,
   * каким он был, — со всеми сроками, какими они были.
   */
  load(items: readonly Moodlet[]): void {
    this.items = items.map((item) => ({ ...item }))
  }

  static fromJSON(items: Moodlet[]): MoodletList {
    const list = new MoodletList()
    list.load(items)
    return list
  }
}
