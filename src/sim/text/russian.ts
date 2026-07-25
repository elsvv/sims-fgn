/**
 * Русские слова там, где в интерфейсе иначе оказались бы цифры.
 *
 * Итоги дня и эпилог — это рассказ, а не ведомость: «проспали семь часов»
 * читается как жизнь, «сон: 428 мин» — как отчёт. Всё, что здесь есть, —
 * чистые функции над числами, поэтому склонения проверяются тестами,
 * а не вылавливаются глазами в готовом экране.
 */

/**
 * Выбирает форму существительного по числу.
 *
 * @param one форма для 1, 21, 31: «пара».
 * @param few форма для 2–4, 22–24: «пары».
 * @param many форма для 0, 5–20: «пар».
 */
export function pluralForm(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(count))
  const tens = abs % 100
  if (tens >= 11 && tens <= 14) return many
  const units = abs % 10
  if (units === 1) return one
  if (units >= 2 && units <= 4) return few
  return many
}

/** Число вместе с существительным: «три пары». */
export function plural(count: number, one: string, few: string, many: string): string {
  return `${count} ${pluralForm(count, one, few, many)}`
}

/**
 * Количественные числительные до двенадцати.
 *
 * Дальше не нужно: длиннее двенадцати часов подряд в игре не спят,
 * а пар в дне не бывает больше семи.
 */
const CARDINALS: readonly string[] = [
  'ноль',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
  'десять',
  'одиннадцать',
  'двенадцать',
]

/** Числительное словом. Числа за пределами таблицы возвращаются цифрами. */
export function cardinal(value: number): string {
  return CARDINALS[Math.trunc(value)] ?? String(value)
}

/**
 * Длительность сна словами.
 *
 * Округляется до часа нарочно: спавший человек не помнит минут, он помнит,
 * что проспал часов шесть. Меньше часа — это уже не сон, и так и написано.
 */
export function describeHours(minutes: number): string {
  const hours = Math.round(minutes / 60)
  if (hours <= 0) return 'меньше часа'
  if (hours === 1) return 'час'
  return `${cardinal(hours)} ${pluralForm(hours, 'час', 'часа', 'часов')}`
}

/**
 * Оценка словом в винительном падеже: «получили восьмёрку».
 *
 * Шкала десятибалльная, и у каждого балла в студенческой речи своё имя.
 * Ноль называется нулём, а не «нолём»: так его и произносят.
 */
const GRADE_WORDS: readonly string[] = [
  'ноль',
  'единицу',
  'двойку',
  'тройку',
  'четвёрку',
  'пятёрку',
  'шестёрку',
  'семёрку',
  'восьмёрку',
  'девятку',
  'десятку',
]

export function gradeWord(grade: number): string {
  return GRADE_WORDS[Math.round(grade)] ?? String(grade)
}

/**
 * Собирает перечисление: «логика, греческий и НИС».
 *
 * Последний элемент присоединяется союзом, а не запятой: список через
 * запятую до конца читается как таблица, а нам нужна фраза.
 */
export function enumerate(items: readonly string[], conjunction = 'и'): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0] ?? ''
  const head = items.slice(0, -1).join(', ')
  return `${head} ${conjunction} ${items[items.length - 1] ?? ''}`
}

/** Первая буква строчной — чтобы фразу можно было вставить в середину предложения. */
export function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

/** Первая буква прописная — чтобы фраза могла начать предложение. */
export function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Сколько ещё ждать — словами: «через полтора часа», «ещё двадцать минут».
 *
 * Форма одна на оба употребления: и «через …», и «ещё … — и…» требуют
 * винительного падежа, а у длительности он совпадает с именительным.
 *
 * Округление до пяти минут — не небрежность, а смысл. «Следующая пара
 * через 112 мин» — это показание прибора: игрок читает его, вычитает
 * в уме и получает «часа два». Ровно это он и должен прочитать сразу.
 * Точное время начала при этом никуда не делось — оно стоит строкой
 * выше, в самом расписании, где ему и место.
 *
 * Слова для кратных пяти минутам перечислены, а не собираются из частей:
 * их всего девять, а собранные из частей числительные однажды выдают
 * «двадцать пять минуты».
 */
const WAIT_WORDS: Readonly<Record<number, string>> = {
  5: 'пять минут',
  10: 'десять минут',
  15: 'пятнадцать минут',
  20: 'двадцать минут',
  25: 'двадцать пять минут',
  30: 'полчаса',
  35: 'тридцать пять минут',
  40: 'сорок минут',
  45: 'сорок пять минут',
}

export function describeWait(minutes: number): string {
  if (minutes < 1.5) return 'минуту'
  if (minutes < 47.5) {
    const step = Math.min(45, Math.max(5, Math.round(minutes / 5) * 5))
    return WAIT_WORDS[step] ?? `${step} минут`
  }
  if (minutes < 82.5) return 'час'
  // Полтора часа — единственная дробная величина, которую по-русски
  // называют вслух: «два с половиной часа» уже говорят редко, а «три
  // с половиной» не говорят вовсе.
  if (minutes < 105) return 'полтора часа'
  const hours = Math.round(minutes / 60)
  return `${cardinal(hours)} ${pluralForm(hours, 'час', 'часа', 'часов')}`
}
