import { describe, expect, it } from 'vitest'
import {
  cardinal,
  describeHours,
  enumerate,
  gradeWord,
  lowerFirst,
  plural,
  pluralForm,
  upperFirst,
} from './russian'

describe('склонение по числу', () => {
  it('единственное число', () => {
    expect(pluralForm(1, 'пара', 'пары', 'пар')).toBe('пара')
    expect(pluralForm(21, 'пара', 'пары', 'пар')).toBe('пара')
  })

  it('от двух до четырёх', () => {
    for (const count of [2, 3, 4, 22, 33]) {
      expect(pluralForm(count, 'пара', 'пары', 'пар'), String(count)).toBe('пары')
    }
  })

  it('пять и больше', () => {
    for (const count of [0, 5, 9, 20, 25]) {
      expect(pluralForm(count, 'пара', 'пары', 'пар'), String(count)).toBe('пар')
    }
  })

  it('подростковые числа — исключение, и оно учтено', () => {
    for (const count of [11, 12, 13, 14, 111]) {
      expect(pluralForm(count, 'пара', 'пары', 'пар'), String(count)).toBe('пар')
    }
  })

  it('склеивает число с существительным', () => {
    expect(plural(3, 'пара', 'пары', 'пар')).toBe('3 пары')
  })
})

describe('числительные словами', () => {
  it('знает числа до двенадцати', () => {
    expect(cardinal(0)).toBe('ноль')
    expect(cardinal(7)).toBe('семь')
    expect(cardinal(12)).toBe('двенадцать')
  })

  it('за пределами таблицы возвращает цифры, а не пустоту', () => {
    expect(cardinal(37)).toBe('37')
  })
})

describe('длительность сна словами', () => {
  it('округляет до часа', () => {
    expect(describeHours(7 * 60 + 20)).toBe('семь часов')
    expect(describeHours(5 * 60)).toBe('пять часов')
  })

  it('склоняет час', () => {
    expect(describeHours(60)).toBe('час')
    expect(describeHours(2 * 60)).toBe('два часа')
    expect(describeHours(4 * 60)).toBe('четыре часа')
  })

  it('короткая ночь называется своим именем', () => {
    expect(describeHours(20)).toBe('меньше часа')
    expect(describeHours(0)).toBe('меньше часа')
  })
})

describe('оценка словом', () => {
  it('называет балл так, как его называют вслух', () => {
    expect(gradeWord(0)).toBe('ноль')
    expect(gradeWord(4)).toBe('четвёрку')
    expect(gradeWord(8)).toBe('восьмёрку')
    expect(gradeWord(10)).toBe('десятку')
  })

  it('в винительном падеже — фраза «получили» должна складываться', () => {
    expect(`получили ${gradeWord(8)}`).toBe('получили восьмёрку')
  })
})

describe('перечисление', () => {
  it('один элемент остаётся собой', () => {
    expect(enumerate(['Логика'])).toBe('Логика')
  })

  it('последний присоединяется союзом, а не запятой', () => {
    expect(enumerate(['Логика', 'НИС'])).toBe('Логика и НИС')
    expect(enumerate(['Логика', 'НИС', 'Греческий'])).toBe('Логика, НИС и Греческий')
  })

  it('пустой список не даёт висящего союза', () => {
    expect(enumerate([])).toBe('')
  })
})

describe('регистр первой буквы', () => {
  it('опускает и поднимает', () => {
    expect(lowerFirst('Уважение выросло')).toBe('уважение выросло')
    expect(upperFirst('уважение выросло')).toBe('Уважение выросло')
  })

  it('пустую строку не ломает', () => {
    expect(lowerFirst('')).toBe('')
    expect(upperFirst('')).toBe('')
  })
})
