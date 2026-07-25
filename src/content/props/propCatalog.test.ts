import { describe, expect, it } from 'vitest'
import { NEED_IDS, type NeedId } from '../../sim/needs/needs'
import type { SkillId } from '../../sim/player/Skills'
import { SEMINAR_SKILL_GAIN } from '../../sim/study/Seminar'
import type { Interaction } from '../../sim/world/PropDefinition'
import { PROP_CATALOG } from './propCatalog'

const INTERACTIONS: Interaction[] = Object.values(PROP_CATALOG).flatMap(
  (definition) => definition.interactions,
)

/** Насколько действие поправляет нужду. У стресса «лучше» — это меньше. */
function relief(interaction: Interaction, need: NeedId): number {
  const delta = interaction.needDelta[need] ?? 0
  return need === 'stress' ? -delta : delta
}

function grants(interaction: Interaction, skill: SkillId): number {
  return interaction.skills?.find((gain) => gain.id === skill)?.amount ?? 0
}

describe('каталог предметов', () => {
  it('идентификатор совпадает с ключом каталога', () => {
    for (const [key, definition] of Object.entries(PROP_CATALOG)) {
      expect(definition.kind, key).toBe(key)
    }
  })

  it('идентификаторы действий не повторяются во всём каталоге', () => {
    // Действие опознаётся парой «предмет + действие», но одинаковые
    // идентификаторы у разных предметов делают нечитаемыми и сохранения,
    // и тесты: «readBeforeClass» должен значить ровно одно место в игре.
    const ids = INTERACTIONS.map((interaction) => interaction.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('каждое действие подписано готовой русской фразой', () => {
    for (const interaction of INTERACTIONS) {
      expect(interaction.label.trim(), interaction.id).toBe(interaction.label)
      expect(interaction.label.length, interaction.id).toBeGreaterThan(4)
      expect(interaction.label, interaction.id).toMatch(/[А-Яа-яЁё]/)
      expect(interaction.label[0], interaction.id).toBe(interaction.label[0]?.toUpperCase())
    }
  })

  it('каждое действие занимает время', () => {
    for (const interaction of INTERACTIONS) {
      expect(interaction.durationMinutes, interaction.id).toBeGreaterThan(0)
    }
  })
})

/**
 * Окно между парами — главный ресурс игрока (дизайн-документ, §3), и
 * проверяется здесь именно как ресурс: есть ли на что его потратить.
 *
 * Пункт 4 списка проблем — «между парами и после них заняться нечем» —
 * наполовину чинится расписанием (courses.ts), а наполовину вот здесь.
 * Три-четыре пары в день не спасут день, в котором в окне можно только
 * выпить воды и посмотреть на доску объявлений.
 *
 * Окна в расписании ВШЭ — норма, и обживают их именно так:
 * «вы часто будете обитать в коворкингах и библиотеке между парами»
 * (research/building.md, §отзывы). Коворкинг стоит в строении 6 на третьем
 * этаже и в игре ещё не построен, поэтому окно проживается тем, что на
 * втором этаже корпуса А есть на самом деле: пустой аудиторией, скамейкой
 * в коридоре, автоматом и раковиной.
 */
describe('в окне между парами есть чем заняться', () => {
  /** Полтора часа — самое короткое окно в расписании модуля. */
  const WINDOW_MINUTES = 90

  it('у каждой нужды есть в каталоге чем её поправить', () => {
    // Нужда, которая только падает, — это не механика, а таймер до
    // конца игры. Гигиену и социальность на этаже нельзя было поправить
    // ничем: первая падала до нуля к четвергу, вторая — к обеду.
    for (const need of NEED_IDS) {
      const best = Math.max(...INTERACTIONS.map((interaction) => relief(interaction, need)))
      expect(best, `нужду «${need}» нечем поправить`).toBeGreaterThan(0)
    }
  })

  it('окно можно потратить на эссе', () => {
    const essayWork = INTERACTIONS.filter((interaction) => (interaction.essayMinutes ?? 0) > 0)
    expect(essayWork.length, 'ни одно действие не двигает эссе').toBeGreaterThan(0)
    // Двадцать минут между парами эссе не пишут: вложение должно быть
    // сопоставимо с самим окном, иначе действие обманывает игрока.
    expect(Math.max(...essayWork.map((i) => i.essayMinutes ?? 0))).toBeGreaterThanOrEqual(45)
  })

  it('в окне растёт каждый навык, от которого зависит семинар', () => {
    const examined: SkillId[] = ['ancientLanguages', 'logic', 'germanClassics', 'academicWriting']
    for (const skill of examined) {
      const best = Math.max(...INTERACTIONS.map((interaction) => grants(interaction, skill)))
      expect(best, `навык «${skill}» негде поднять между парами`).toBeGreaterThan(0)
    }
  })

  it('окно не выгоднее семинара', () => {
    // Выступление — главное учебное действие игры (дизайн-документ, §5.2).
    // Час за партой в пустой аудитории не должен давать больше, чем
    // сказанное вслух при всех.
    for (const interaction of INTERACTIONS) {
      for (const gain of interaction.skills ?? []) {
        expect(gain.amount, `${interaction.id} → ${gain.id}`).toBeLessThanOrEqual(
          SEMINAR_SKILL_GAIN,
        )
      }
    }
  })

  it('каждое действие успевает кончиться внутри самого короткого окна', () => {
    // Действие длиннее окна нельзя довести до конца, а засчитывается оно
    // только целиком: игрок потерял бы время и не получил ничего.
    for (const interaction of INTERACTIONS) {
      expect(interaction.durationMinutes, interaction.id).toBeLessThanOrEqual(WINDOW_MINUTES)
    }
  })

  it('полтора часа набираются занятиями, а не одной кнопкой', () => {
    // Окно, которое закрывается одним длинным действием, — это не выбор,
    // а кнопка «промотать». Значимых по времени занятий должно быть
    // столько, чтобы окно приходилось складывать из нескольких.
    const substantial = INTERACTIONS.filter((interaction) => interaction.durationMinutes >= 15)
    expect(substantial.length).toBeGreaterThanOrEqual(5)

    const longest = [...substantial]
      .sort((a, b) => b.durationMinutes - a.durationMinutes)
      .slice(0, 3)
    const together = longest.reduce((sum, interaction) => sum + interaction.durationMinutes, 0)
    expect(together).toBeGreaterThanOrEqual(WINDOW_MINUTES)
  })

  it('поесть можно всерьёз, а не только шоколадкой', () => {
    // До открытия столовой (26 ноября, research/student-life.md) обед —
    // это автомат, и он должен закрывать голод как обед, а не как перекус.
    const best = Math.max(...INTERACTIONS.map((interaction) => relief(interaction, 'hunger')))
    expect(best).toBeGreaterThanOrEqual(40)
  })
})
