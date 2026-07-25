import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { moodWeight } from '../../sim/needs/Moodlets'
import { standingOf } from '../../sim/social/Relationship'

/**
 * Постоянный интерфейс не говорит с игроком числами там, где числа ничего
 * не значат.
 *
 * В окне разговора это правило соблюдалось с самого начала, а панели врали
 * рядом с ним: список людей показывал «+8 / −6», модификатор настроения —
 * «+40». Сравнить эти величины игроку не с чем: шкалы отношений и шкалы
 * настроения он нигде не видит и видеть не должен.
 *
 * Числа остаются там, где они есть и в жизни: оценка по десятибалльной
 * шкале, время, средний балл, место в рейтинге, деньги. Навык — та же
 * десятибалльная шкала, поэтому «6,4» рядом с полоской остаётся числом.
 * Заполненность нужд — процент собственной полоски, там сравнивать есть
 * с чем, и это тоже не запрещено.
 *
 * Проверка идёт по исходникам нарочно: правило легко нарушить заново одной
 * строчкой в новой панели, а поймать это глазами на ревью — нельзя.
 */

const UI_DIR = join(process.cwd(), 'src', 'render', 'ui')

function read(name: string): string {
  return readFileSync(join(UI_DIR, name), 'utf8')
}

/** Число со знаком в шаблонной строке: «+${x}», «−${Math.abs(x)}». */
const SIGNED_NUMBER = /`\s*[+−-]\s*\$\{/

/** Приведение величины к целому — так печатают, а не считают. */
const ROUNDING = /Math\.(round|abs)\(/

const PANELS = ['PeoplePanel.tsx', 'SkillsPanel.tsx']

describe('панели не печатают отношений и настроения числами', () => {
  it('исходники панелей на месте', () => {
    for (const panel of PANELS) {
      expect(read(panel).length, panel).toBeGreaterThan(0)
    }
  })

  it('ни в одной нет числа со знаком', () => {
    for (const panel of PANELS) {
      expect(SIGNED_NUMBER.test(read(panel)), `${panel}: «+8» вместо слов`).toBe(false)
    }
  })

  it('ни в одной величина не округляется для показа', () => {
    for (const panel of PANELS) {
      expect(ROUNDING.test(read(panel)), `${panel}: величина печатается числом`).toBe(false)
    }
  })

  it('список людей берёт слова из симуляции, а не сочиняет свои', () => {
    const source = read('PeoplePanel.tsx')
    expect(source).toMatch(/standingOf/)
    expect(source).toMatch(/record\.label/)
  })

  it('вес модификатора настроения тоже приходит словами', () => {
    expect(read('SkillsPanel.tsx')).toMatch(/moodWeight/)
  })

  it('слова, которые получат панели, чисел не содержат', () => {
    // Та же проверка с другой стороны: даже если исходник чист, наружу
    // не должно выйти ни одной цифры.
    for (const standing of standingOf({ affection: 42, respect: -17 })) {
      expect(standing.text, standing.dimension).not.toMatch(/\d/)
      expect(standing.marker, standing.dimension).not.toMatch(/\d/)
    }
    expect(moodWeight(-45).text).not.toMatch(/\d/)
  })
})
