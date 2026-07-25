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
 *
 * Поле moodletId связывает действие с каталогом модификаторов настроения
 * (src/content/moodlets.ts): ожидание лифта оставляет раздражение на час,
 * кофе — бодрость на два. Нужды отвечают за физиологию, модификатор — за то,
 * что персонаж об этом думает. Ссылки сторожит src/content/moodlets.test.ts.
 *
 * ОКНО МЕЖДУ ПАРАМИ. Половина каталога написана ради него. Дизайн-документ,
 * §3: «окна между парами — свободное время, главный ресурс игрока», и
 * research/building.md подтверждает, что это норма расписания: «вы часто
 * будете обитать в коворкингах и библиотеке между парами». Ресурсом окно
 * делает не длина, а то, на что его можно потратить: пока в каталоге были
 * одни двухминутные мелочи, полтора часа между парами нечем было занять,
 * и день проматывался сном (пункт 4 списка проблем).
 *
 * Настоящий коворкинг стоит в строении 6 на третьем этаже, и в игре его
 * ещё нет. Поэтому окно проживается тем, что на втором этаже корпуса А
 * действительно есть: пустой аудиторией (между парами она свободна,
 * и парта — единственный стол на этаже), скамейкой в коридоре, автоматом
 * и раковиной в туалете.
 *
 * Длинные действия нарочно короче самого короткого окна расписания
 * (полтора часа): действие засчитывается только целиком, и то, что не
 * успевает кончиться, отняло бы у игрока время впустую. Прирост навыка
 * за окно нарочно меньше, чем за выступление на семинаре: главное учебное
 * действие игры — сказанное вслух при всех, а не час за партой. Оба
 * правила сторожит propCatalog.test.ts.
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
      /*
       * Три занятия для пустой аудитории. Между парами за партой сидят
       * ровно за этим, и это единственный стол на построенном этаже.
       *
       * Эссе пишется за несколько сессий (дизайн-документ, §5.3), и час —
       * ровно та порция, которая помещается в окно вместе с дорогой.
       * Минуты уходят в ближайшее несданное эссе, как и у карточки
       * воскресенья: окно — такое же потраченное время, что и выходной,
       * только его в модуле в разы больше.
       */
      {
        id: 'writeEssay',
        label: 'Сесть за эссе',
        durationMinutes: 60,
        needDelta: { energy: -14, fun: -16, social: -8, stress: 8 },
        skills: [{ id: 'academicWriting', amount: 0.3 }],
        essayMinutes: 60,
        moodletId: 'essayMovedForward',
      },
      // Источник навыка — из дизайн-документа, §4.3: «пары и домашние
      // задания у Алиевой, „Антибарбари“, библиотека».
      {
        id: 'translateGreek',
        label: 'Разбирать греческий со словарём',
        durationMinutes: 45,
        needDelta: { energy: -10, fun: -12, social: -6, stress: -2 },
        skills: [{ id: 'ancientLanguages', amount: 0.3 }],
      },
      // Оттуда же: «задачи Долгорукова, споры о формальных вопросах».
      // Задача, которая сошлась, успокаивает, — в отличие от эссе.
      {
        id: 'solveLogicProblems',
        label: 'Решать задачи по логике',
        durationMinutes: 40,
        needDelta: { energy: -10, fun: -4, social: -6, stress: -6 },
        skills: [{ id: 'logic', amount: 0.3 }],
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
      /*
       * Обед. До 26 ноября 2018 года в комплексе есть было негде
       * (research/student-life.md): либо поход на Арму через дорогу, либо
       * вот это. Шоколадка на бегу голод не закрывает — обедом становится
       * только осознанная попытка наесться из автомата, и модификатор
       * «Пообедал шоколадкой из автомата» висит именно на ней.
       */
      {
        id: 'vendingLunch',
        label: 'Пообедать тем, что есть в автомате',
        durationMinutes: 18,
        needDelta: { hunger: 50, bladder: -8, fun: -6, stress: 4 },
        moodletId: 'lunchFromVendingMachine',
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
        moodletId: 'vendingCoffee',
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
      // Дизайн-документ, §4.3: немецкая классика качается «чтением Канта,
      // Гегеля и Хайдеггера». Читают их не за партой, а где придётся, —
      // и от этого чтения нервничают, а не успокаиваются.
      {
        id: 'readGermanClassics',
        label: 'Читать немцев к семинару',
        durationMinutes: 45,
        needDelta: { energy: -12, fun: -8, social: -6, stress: 6 },
        skills: [{ id: 'germanClassics', amount: 0.3 }],
      },
      /*
       * Единственный источник социальности на этаже. Однокурсников в игре
       * ещё нет отдельными людьми — есть поток из двадцати четырёх человек
       * (content/study/cohort.ts), и коридор между парами полон именно им.
       * Пока этого действия не было, социальность только падала: нужда,
       * которую нечем поправить, — это не механика, а таймер.
       */
      {
        id: 'chatWithClassmates',
        label: 'Поболтать с однокурсниками',
        durationMinutes: 20,
        needDelta: { social: 34, fun: 16, energy: -4, stress: -10 },
        moodletId: 'talkedInTheHallway',
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
      /*
       * Раковина. Та самая, у которой стоит Марей в первой большой сцене
       * игры (content/dialogue/marey-restroom.ts), — и единственное место
       * на этаже, где можно поправить гигиену. Душа в игре нет и не будет
       * до общаги, а нужда падает всю неделю: холодная вода на лицо —
       * это не гигиена целиком, но это способ дотянуть до вечера.
       */
      {
        id: 'washUp',
        label: 'Умыться холодной водой',
        durationMinutes: 4,
        needDelta: { hygiene: 30, energy: 8, stress: -6 },
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
        moodletId: 'waitedForElevator',
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
        moodletId: 'tookTheStairs',
      },
    ],
  },
}
