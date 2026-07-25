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

  static fromJSON(items: Moodlet[]): MoodletList {
    const list = new MoodletList()
    list.items = items.map((item) => ({ ...item }))
    return list
  }
}
