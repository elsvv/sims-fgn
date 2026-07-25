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
  /**
   * Помещения этажа. Идентификатор — это то, чем помещение называют
   * в расписании и в разговоре: «А-204», «коридор». Дверные проёмы
   * (строки 5 и 8) нарочно не отданы никому: стоя в дверях, ты ещё
   * не в аудитории.
   *
   * Номер А-204 подтверждён программой конференции Школы философии
   * (research/building.md). А-206 — обоснованное допущение: полный список
   * аудиторий закрыт в системе расписаний, но нумерация корпуса А
   * («буква корпуса — этаж — порядковый номер») делает такой номер
   * единственно возможным для второй аудитории того же этажа.
   */
  rooms: [
    { id: 'А-204', name: 'Аудитория А-204', col0: 1, row0: 1, col1: 8, row1: 4 },
    { id: 'А-206', name: 'Аудитория А-206', col0: 14, row0: 1, col1: 22, row1: 4 },
    { id: 'коридор', name: 'Коридор', col0: 1, row0: 6, col1: 22, row1: 7 },
    { id: 'туалеты', name: 'Туалеты', col0: 1, row0: 9, col1: 6, row1: 11 },
    { id: 'лифтовый холл', name: 'Лифтовый холл', col0: 17, row0: 9, col1: 22, row1: 11 },
  ],
  props: [
    // Аудитория А-204
    { id: 'a204-board', kind: 'whiteboard', col: 4, row: 1, rotation: 0, blocks: true },
    { id: 'a204-desk-1', kind: 'desk', col: 2, row: 3, rotation: 0, blocks: true },
    { id: 'a204-desk-2', kind: 'desk', col: 4, row: 3, rotation: 0, blocks: true },
    { id: 'a204-desk-3', kind: 'desk', col: 6, row: 3, rotation: 0, blocks: true },

    /*
     * Стулья. Стоят южнее своих парт — на тех самых клетках, куда игра
     * приводит человека, решившего партой воспользоваться. Клетку они
     * не перекрывают: на стул надо встать, чтобы на него сесть.
     * Поворот на пол-оборота — спинкой к двери, лицом к доске.
     */
    { id: 'a204-chair-1', kind: 'chair', col: 2, row: 4, rotation: Math.PI, blocks: false },
    { id: 'a204-chair-2', kind: 'chair', col: 4, row: 4, rotation: Math.PI, blocks: false },
    { id: 'a204-chair-3', kind: 'chair', col: 6, row: 4, rotation: Math.PI, blocks: false },

    // Аудитория А-206
    { id: 'a206-board', kind: 'whiteboard', col: 18, row: 1, rotation: 0, blocks: true },
    { id: 'a206-desk-1', kind: 'desk', col: 16, row: 3, rotation: 0, blocks: true },
    { id: 'a206-desk-2', kind: 'desk', col: 18, row: 3, rotation: 0, blocks: true },
    { id: 'a206-desk-3', kind: 'desk', col: 20, row: 3, rotation: 0, blocks: true },
    { id: 'a206-chair-1', kind: 'chair', col: 16, row: 4, rotation: Math.PI, blocks: false },
    { id: 'a206-chair-2', kind: 'chair', col: 18, row: 4, rotation: Math.PI, blocks: false },
    { id: 'a206-chair-3', kind: 'chair', col: 20, row: 4, rotation: Math.PI, blocks: false },

    // Коридор
    { id: 'notices-1', kind: 'noticeBoard', col: 3, row: 6, rotation: 0, blocks: true },
    { id: 'purifier-1', kind: 'purifier', col: 10, row: 6, rotation: 0, blocks: true },
    { id: 'vending-1', kind: 'vendingMachine', col: 11, row: 6, rotation: 0, blocks: true },
    { id: 'coffee-1', kind: 'coffeeMachine', col: 12, row: 6, rotation: 0, blocks: true },
    { id: 'bench-1', kind: 'bench', col: 20, row: 6, rotation: 0, blocks: true },

    /*
     * Туалеты. Унитазы стоят у южной стены и развёрнуты на пол-оборота:
     * бачок к стене, чаша в помещение. Пока предметы были боксами, поворот
     * ничего не значил и они стояли посреди комнаты; с настоящей моделью
     * это сразу видно.
     */
    { id: 'toilet-1', kind: 'toilet', col: 2, row: 11, rotation: Math.PI, blocks: true },
    { id: 'toilet-2', kind: 'toilet', col: 4, row: 11, rotation: Math.PI, blocks: true },

    /*
     * Лифтовый холл. Двери лифта — в западной стене холла, за которой
     * идёт глухое ядро здания: шахте больше негде быть. Развёрнуты
     * на четверть оборота, чтобы смотреть в холл.
     */
    { id: 'stairs-1', kind: 'stairs', col: 18, row: 10, rotation: 0, blocks: true },
    {
      id: 'elevator-1',
      kind: 'elevator',
      col: 17,
      row: 10,
      rotation: Math.PI / 2,
      blocks: true,
    },
  ],
}

/**
 * Где появляется игрок: свободный участок коридора в западной половине.
 * Нарочно не у автоматов (столбцы 10–12): персонаж, возникший вплотную
 * к пурифайеру и двум шкафам в человеческий рост, сливается с ними
 * и в первом кадре игры его просто не видно.
 */
export const FLOOR_A2_SPAWN: GridPos = { col: 6, row: 7 }
