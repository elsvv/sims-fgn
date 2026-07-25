import { describe, expect, it } from 'vitest'
import type { PropPlacement } from '../../sim/world/FloorPlan'
import type { PropCatalog, PropDefinition } from '../../sim/world/PropDefinition'
import { planPropRender, propBoxOffset, propModelOf, propModelUrls } from './propGroups'

function definition(kind: string, model: PropDefinition['model']): PropDefinition {
  return {
    kind,
    label: kind,
    size: { w: 0.9, d: 0.5, h: 1 },
    color: '#c8b18b',
    blocks: true,
    interactions: [],
    model,
  }
}

function at(id: string, kind: string, col: number, row: number): PropPlacement {
  return { id, kind, col, row, rotation: 0, blocks: true }
}

const CATALOG: PropCatalog = {
  desk: definition('desk', { url: '/models/props/desk.glb', fit: 'stretch' }),
  board: definition('board', { url: '/models/props/paneling.glb', fit: 'stretch' }),
  notice: definition('notice', { url: '/models/props/paneling.glb', fit: 'stretch' }),
  stool: definition('stool', 'box'),
  ghost: definition('ghost', undefined),
}

describe('выбор модели по виду предмета', () => {
  it('у предмета с моделью берётся его модель', () => {
    expect(propModelOf(CATALOG.desk)?.url).toBe('/models/props/desk.glb')
  })

  it('явное «бокс» означает отсутствие модели', () => {
    expect(propModelOf(CATALOG.stool)).toBeNull()
  })

  it('незаполненное поле означает отсутствие модели', () => {
    expect(propModelOf(CATALOG.ghost)).toBeNull()
  })

  it('неизвестный предмет не роняет выбор', () => {
    expect(propModelOf(undefined)).toBeNull()
  })

  it('пустой путь к файлу — это тоже отсутствие модели', () => {
    // Опечатка в данных не должна превращаться в запрос за корень сайта
    // и в исключение посреди отрисовки.
    expect(propModelOf(definition('broken', { url: '', fit: 'contain' }))).toBeNull()
  })
})

describe('раскладка обстановки на модели и боксы', () => {
  const placements = [
    at('desk-1', 'desk', 1, 1),
    at('stool-1', 'stool', 2, 1),
    at('desk-2', 'desk', 3, 1),
    at('ghost-1', 'ghost', 4, 1),
    at('desk-3', 'desk', 5, 1),
  ]

  it('одинаковые предметы собираются в одну группу', () => {
    const plan = planPropRender(placements, CATALOG)
    expect(plan.modelled.map((group) => group.kind)).toEqual(['desk'])
    expect(plan.modelled[0]?.placements.map((p) => p.id)).toEqual([
      'desk-1',
      'desk-2',
      'desk-3',
    ])
  })

  it('предметы без модели уходят в боксы', () => {
    const plan = planPropRender(placements, CATALOG)
    expect(plan.boxed.map((item) => item.placement.id)).toEqual(['stool-1', 'ghost-1'])
  })

  it('порядок размещений внутри группы совпадает с планировкой', () => {
    // Номер экземпляра — это позиция в списке. Переставь их местами —
    // и предметы поменяются клетками при следующей перерисовке.
    const plan = planPropRender(placements.slice().reverse(), CATALOG)
    expect(plan.modelled[0]?.placements.map((p) => p.id)).toEqual([
      'desk-3',
      'desk-2',
      'desk-1',
    ])
  })

  it('предмет, которого нет в каталоге, не рисуется вовсе', () => {
    // Его габарит неизвестен, а выдуманный разошёлся бы с проходимостью.
    const plan = planPropRender([at('x-1', 'нет-такого', 1, 1)], CATALOG)
    expect(plan.modelled).toEqual([])
    expect(plan.boxed).toEqual([])
  })

  it('разные предметы из одного файла остаются разными группами', () => {
    // Иначе доска объявлений и доска в аудитории делили бы материалы
    // и красились одним цветом.
    const plan = planPropRender(
      [at('b-1', 'board', 1, 1), at('n-1', 'notice', 2, 1)],
      CATALOG,
    )
    expect(plan.modelled.map((group) => group.kind)).toEqual(['board', 'notice'])
  })

  it('пустая планировка даёт пустую раскладку', () => {
    expect(planPropRender([], CATALOG)).toEqual({ modelled: [], boxed: [] })
  })
})

describe('список файлов для предзагрузки', () => {
  it('повторяющийся файл в списке один', () => {
    expect(propModelUrls(CATALOG)).toEqual([
      '/models/props/desk.glb',
      '/models/props/paneling.glb',
    ])
  })

  it('каталог без моделей не требует предзагрузки', () => {
    expect(propModelUrls({ stool: CATALOG.stool! })).toEqual([])
  })
})

describe('положение бокса внутри клетки', () => {
  const size = { w: 0.9, d: 0.5, h: 1.2 }

  it('без модели бокс стоит посередине клетки и на полу', () => {
    expect(propBoxOffset(size, null, 1)).toEqual({ x: 0, y: 0.6, z: 0 })
  })

  it('бокс повторяет прижатие модели к стене', () => {
    // Бокс — это и запасной вид предмета, и мишень для мыши. Оба обязаны
    // оказаться там же, где окажется модель, иначе доска висит на стене,
    // а кликается посреди аудитории.
    const offset = propBoxOffset(size, { url: 'x', fit: 'stretch', align: 'back' }, 1)
    expect(offset.z).toBeCloseTo(-0.25, 9)
  })

  it('бокс повторяет подвес модели на стену', () => {
    const offset = propBoxOffset(
      size,
      { url: 'x', fit: 'stretch', align: 'back', offset: { y: 0.75 } },
      1,
    )
    expect(offset.y).toBeCloseTo(0.75 + 0.6, 9)
  })

  it('предмет глубже клетки не выталкивается наружу', () => {
    const offset = propBoxOffset(
      { w: 1, d: 2, h: 1 },
      { url: 'x', fit: 'stretch', align: 'back' },
      1,
    )
    expect(offset.z).toBe(0)
  })
})
