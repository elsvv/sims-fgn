import type { PropCatalog } from '../../sim/world/PropDefinition'

/**
 * Каталог предметов второго этажа корпуса А.
 * Числа в needDelta — игровой баланс, а не физика: кофе бодрит сильно,
 * но бьёт по мочевому пузырю; ожидание лифта не даёт ничего, кроме
 * стресса, и это ровно то, чего мы добиваемся.
 *
 * Габариты — не физика тоже, а следствие сетки: предмет занимает ровно
 * одну клетку навигации, поэтому ни ширина, ни глубина не могут выходить
 * за размер клетки. Иначе видимое разойдётся с проходимым — доска накроет
 * соседнюю клетку, по которой персонаж всё равно спокойно пройдёт.
 * Правило сторожит тест в src/content/floors/floorA2.test.ts.
 * Высота ничем не ограничена: вверх ходить нельзя.
 */
export const PROP_CATALOG: PropCatalog = {
  desk: {
    kind: 'desk',
    label: 'Парта',
    size: { w: 0.9, d: 0.6, h: 0.75 },
    color: '#c8b18b',
    blocks: true,
    interactions: [
      {
        id: 'sitAndListen',
        label: 'Сесть и слушать',
        durationMinutes: 40,
        needDelta: { energy: -6, fun: -10, social: -4 },
      },
      {
        id: 'scrollPhone',
        label: 'Залипнуть в телефон',
        durationMinutes: 15,
        needDelta: { fun: 18, stress: -6 },
      },
    ],
  },
  whiteboard: {
    kind: 'whiteboard',
    label: 'Доска',
    size: { w: 0.9, d: 0.1, h: 1.2 },
    color: '#2b3a2f',
    blocks: true,
    interactions: [
      {
        id: 'readBoard',
        label: 'Разобрать, что написано',
        durationMinutes: 5,
        needDelta: { stress: 4 },
      },
    ],
  },
  purifier: {
    kind: 'purifier',
    label: 'Пурифайер',
    size: { w: 0.4, d: 0.4, h: 1.3 },
    color: '#5f8fa8',
    blocks: true,
    interactions: [
      {
        id: 'drinkWater',
        label: 'Набрать воды',
        durationMinutes: 2,
        needDelta: { hunger: 4, bladder: -6, stress: -2 },
      },
    ],
  },
  vendingMachine: {
    kind: 'vendingMachine',
    label: 'Автомат с едой',
    size: { w: 0.9, d: 0.8, h: 1.9 },
    color: '#3b4b5e',
    blocks: true,
    interactions: [
      {
        id: 'buySnack',
        label: 'Взять шоколадку',
        durationMinutes: 3,
        needDelta: { hunger: 20, fun: 6 },
      },
    ],
  },
  coffeeMachine: {
    kind: 'coffeeMachine',
    label: 'Кофейный автомат',
    size: { w: 0.7, d: 0.7, h: 1.8 },
    color: '#2f3438',
    blocks: true,
    interactions: [
      {
        id: 'drinkCoffee',
        label: 'Взять кофе',
        durationMinutes: 6,
        needDelta: { energy: 28, hunger: 6, bladder: -12 },
      },
    ],
  },
  bench: {
    kind: 'bench',
    label: 'Скамейка в коридоре',
    size: { w: 0.9, d: 0.5, h: 0.45 },
    color: '#8a6f4d',
    blocks: true,
    interactions: [
      {
        id: 'rest',
        label: 'Посидеть',
        durationMinutes: 15,
        needDelta: { energy: 10, stress: -10 },
      },
      {
        id: 'readBeforeClass',
        label: 'Дочитать перед парой',
        durationMinutes: 20,
        needDelta: { energy: -5, stress: -12, fun: -4 },
      },
    ],
  },
  noticeBoard: {
    kind: 'noticeBoard',
    label: 'Доска объявлений',
    size: { w: 0.9, d: 0.1, h: 1.0 },
    color: '#102d69',
    blocks: true,
    interactions: [
      {
        id: 'readNotices',
        label: 'Почитать объявления',
        durationMinutes: 4,
        needDelta: { fun: 6, stress: -2 },
      },
    ],
  },
  toilet: {
    kind: 'toilet',
    label: 'Туалет',
    size: { w: 0.6, d: 0.7, h: 0.8 },
    color: '#dfe3e6',
    blocks: true,
    interactions: [
      {
        id: 'relieve',
        label: 'Сходить в туалет',
        durationMinutes: 5,
        needDelta: { bladder: 100 },
      },
    ],
  },
  elevator: {
    kind: 'elevator',
    label: 'Лифт',
    size: { w: 0.9, d: 0.3, h: 2.2 },
    color: '#9aa3ab',
    blocks: true,
    interactions: [
      {
        id: 'waitForElevator',
        label: 'Ждать лифт',
        durationMinutes: 9,
        needDelta: { stress: 12, fun: -8 },
      },
    ],
  },
  stairs: {
    kind: 'stairs',
    label: 'Лестница',
    size: { w: 1.0, d: 1.0, h: 0.5 },
    color: '#a49c8e',
    blocks: false,
    interactions: [
      {
        id: 'takeStairs',
        label: 'Пойти пешком',
        durationMinutes: 3,
        needDelta: { energy: -8, stress: -4 },
      },
    ],
  },
}
