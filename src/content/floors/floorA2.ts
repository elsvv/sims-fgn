import type { GridPos } from '../../sim/types'
import type { FloorPlan } from '../../sim/world/FloorPlan'

/**
 * Корпус А, 2 этаж — лифтовый холл и коридор.
 * Опирается на research/building.md: это отправная точка всей навигации
 * по комплексу на Старой Басманной.
 *
 * Сверху — две аудитории (А-204 слева, А-206 справа), между ними и
 * коридором дверные проёмы. Посередине — коридор с пурифайером,
 * автоматами, доской объявлений и скамейкой. Снизу слева — туалеты,
 * снизу справа — лифтовый холл с единственным лифтом и лестницей.
 *
 * Легенда: # стена, . пол, + дверной проём, пробел — вне здания.
 */
export const FLOOR_A2: FloorPlan = {
  id: 'basmannaya-a2',
  name: 'Старая Басманная, корпус А, 2 этаж',
  cellSize: 1,
  legend: {
    '#': 'wall',
    '.': 'floor',
    '+': 'door',
    ' ': 'void',
  },
  tiles: [
    '########################',
    '#........#####.........#',
    '#........#####.........#',
    '#........#####.........#',
    '#........#####.........#',
    '####+#############+#####',
    '#......................#',
    '#......................#',
    '###+################+###',
    '#......##########......#',
    '#......##########......#',
    '#......##########......#',
    '########################',
  ],
  props: [
    // Аудитория А-204
    { id: 'a204-board', kind: 'whiteboard', col: 4, row: 1, rotation: 0, blocks: true },
    { id: 'a204-desk-1', kind: 'desk', col: 2, row: 3, rotation: 0, blocks: true },
    { id: 'a204-desk-2', kind: 'desk', col: 4, row: 3, rotation: 0, blocks: true },
    { id: 'a204-desk-3', kind: 'desk', col: 6, row: 3, rotation: 0, blocks: true },

    // Аудитория А-206
    { id: 'a206-board', kind: 'whiteboard', col: 18, row: 1, rotation: 0, blocks: true },
    { id: 'a206-desk-1', kind: 'desk', col: 16, row: 3, rotation: 0, blocks: true },
    { id: 'a206-desk-2', kind: 'desk', col: 18, row: 3, rotation: 0, blocks: true },
    { id: 'a206-desk-3', kind: 'desk', col: 20, row: 3, rotation: 0, blocks: true },

    // Коридор
    { id: 'notices-1', kind: 'noticeBoard', col: 3, row: 6, rotation: 0, blocks: true },
    { id: 'purifier-1', kind: 'purifier', col: 10, row: 6, rotation: 0, blocks: true },
    { id: 'vending-1', kind: 'vendingMachine', col: 11, row: 6, rotation: 0, blocks: true },
    { id: 'coffee-1', kind: 'coffeeMachine', col: 12, row: 6, rotation: 0, blocks: true },
    { id: 'bench-1', kind: 'bench', col: 20, row: 6, rotation: 0, blocks: true },

    // Туалеты
    { id: 'toilet-1', kind: 'toilet', col: 2, row: 10, rotation: 0, blocks: true },
    { id: 'toilet-2', kind: 'toilet', col: 4, row: 10, rotation: 0, blocks: true },

    // Лифтовый холл
    { id: 'stairs-1', kind: 'stairs', col: 18, row: 10, rotation: 0 },
    { id: 'elevator-1', kind: 'elevator', col: 21, row: 10, rotation: 0, blocks: true },
  ],
}

/** Где появляется игрок: посреди коридора, у автоматов. */
export const FLOOR_A2_SPAWN: GridPos = { col: 11, row: 7 }
