import type { MoodletCatalog } from '../sim/needs/Moodlets'

/**
 * Каталог модификаторов настроения.
 *
 * Дизайн-документ, раздел 4.2: модификаторы — главный источник юмора
 * и обратной связи. Поэтому подпись здесь важнее числа: игрок читает
 * строчку «Ждал лифт восемь минут» и узнаёт свой день, а не баланс.
 *
 * Величина сдвига и длительность — игровой баланс. Порядок величин задан
 * примерами из дизайн-документа: похвала Михайловского +40 на шесть часов
 * — это потолок, обычная бытовая мелочь стоит около десятки.
 *
 * Пометки над записями:
 * — [дизайн-документ] — пример приведён в разделе 4.2 дословно;
 * — [исследование] — опирается на подтверждённую фактуру из research/;
 * — [допущение] — написано нами в том же духе.
 */
export const MOODLETS: MoodletCatalog = {
  // [дизайн-документ, §4.2] «Похвалил Михайловский» +40, 6 ч
  praisedByMikhailovsky: {
    id: 'praisedByMikhailovsky',
    label: 'Похвалил Михайловский',
    mood: 40,
    durationMinutes: 360,
  },

  // [дизайн-документ, §4.2] «Опоздал к Марею» −30, 4 ч
  lateToMarey: {
    id: 'lateToMarey',
    label: 'Опоздал к Марею',
    mood: -30,
    durationMinutes: 240,
  },

  // [дизайн-документ, §4.2] «Прочитал 20 страниц Гегеля перед сном» −Ясность, 8 ч
  hegelBeforeSleep: {
    id: 'hegelBeforeSleep',
    label: 'Прочитал двадцать страниц Гегеля перед сном',
    mood: -15,
    durationMinutes: 480,
  },

  // [дизайн-документ, §4.2] «Кофе из автомата на втором этаже» +Бодрость, 2 ч
  vendingCoffee: {
    id: 'vendingCoffee',
    label: 'Кофе из автомата на втором этаже',
    mood: 16,
    durationMinutes: 120,
  },

  // [дизайн-документ, §4.2] «Сдал эссе за 20 минут до дедлайна» +Эйфория, 3 ч
  essayJustInTime: {
    id: 'essayJustInTime',
    label: 'Сдал эссе за двадцать минут до дедлайна',
    mood: 35,
    durationMinutes: 180,
  },

  // [дизайн-документ, §4.2] «Ждал лифт 8 минут» −Раздражение, 1 ч
  waitedForElevator: {
    id: 'waitedForElevator',
    label: 'Ждал лифт восемь минут',
    mood: -12,
    durationMinutes: 60,
  },

  // [исследование: research/building.md — лестница, где «ступени отваливаются»]
  tookTheStairs: {
    id: 'tookTheStairs',
    label: 'Поднялся по лестнице, где отваливаются ступени',
    mood: -8,
    durationMinutes: 45,
  },

  // [исследование: research/building.md — «из старых окон дует», решётки,
  // «чтобы закрыть окно, нужно альпинистское снаряжение»]
  draughtFromOldWindow: {
    id: 'draughtFromOldWindow',
    label: 'Из старых окон дует, а закрыть их некому',
    mood: -7,
    durationMinutes: 90,
  },

  // [допущение] Главная награда семинара, дизайн-документ §5.2.
  // Идентификатор объявлен в sim/study/Seminar.ts: механика знает, что ей
  // нужен модификатор на успех, но не знает, как он подписан.
  spokeAtSeminar: {
    id: 'spokeAtSeminar',
    label: 'Выступил на семинаре',
    mood: 22,
    durationMinutes: 240,
  },

  // [допущение] И главный риск оттуда же. Провал стоит дороже, чем стоит
  // успех: сказанную при всех глупость помнят дольше, чем удачную реплику.
  failedAtSeminar: {
    id: 'failedAtSeminar',
    label: 'Провалился на семинаре',
    mood: -28,
    durationMinutes: 300,
  },

  // [исследование: research/marey-deep.md, §6.6 — его фирменная формула.
  // Подчёркнутая вежливость с ледяным дном бьёт сильнее крика.]
  mildBewilderment: {
    id: 'mildBewilderment',
    label: 'Услышал «как минимум, лёгкое недоумение»',
    mood: -25,
    durationMinutes: 300,
  },

  /*
   * Пять исходов сцены «Марей в туалете». Каждый разговор с ним
   * запоминается на полдня — разговор, который кончился темой курсовой,
   * и разговор, после которого он придержал вам дверь, помнятся одинаково
   * долго и с разным знаком. Привязка — в концовках цепочки,
   * см. content/dialogue/marey-restroom.ts.
   */

  // [допущение] Братство по оружию: вышли из туалета соучастниками.
  caughtMareyAtTheSink: {
    id: 'caughtMareyAtTheSink',
    label: 'Поймали Марея у раковины и разошлись соучастниками',
    mood: 30,
    durationMinutes: 480,
  },

  // [допущение] Учёная дуэль: он опоздал на собственную лекцию и был доволен.
  academicDuelDrawn: {
    id: 'academicDuelDrawn',
    label: 'Свели учёную дуэль вничью, и он опоздал на лекцию',
    mood: 20,
    durationMinutes: 360,
  },

  // [исследование: research/marey-deep.md, §6.2, telegram #667 — тема курсовой
  // с пререквизитами «начальная латынь, развитая фантазия, доля безумия»]
  courseworkFromNowhere: {
    id: 'courseworkFromNowhere',
    label: 'Спор у раковины кончился темой для курсовой',
    mood: 28,
    durationMinutes: 480,
  },

  // [исследование: research/marey-deep.md, §6.2, telegram #444 — «Помните,
  // что это вам нужно». Он придерживает дверь, и это хуже, чем хлопнуть ею.]
  heHeldTheDoorOpen: {
    id: 'heHeldTheDoorOpen',
    label: 'Он придержал вам дверь, и это было хуже всего',
    mood: -20,
    durationMinutes: 300,
  },

  // [исследование: research/alieva.md — семинары Antibarbari шли по субботам,
  // и люди приходили в свой единственный выходной читать «Федона».]
  antibarbariSaturday: {
    id: 'antibarbariSaturday',
    label: 'Суббота, а ты читаешь «Федона» по-гречески',
    mood: 20,
    durationMinutes: 480,
  },

  // [дизайн-документ, §6.2.1] Ридинг-группа «Кант»: 700 страниц, четыре года.
  kantReadingGroup: {
    id: 'kantReadingGroup',
    label: 'За встречу ридинг-группы продвинулись на шесть страниц Канта',
    mood: 12,
    durationMinutes: 360,
  },

  // [дизайн-документ, §3] Ночевать в коворкинге можно. Игра показывает почему.
  sleptInCoworking: {
    id: 'sleptInCoworking',
    label: 'Ночевал в коворкинге',
    mood: -35,
    durationMinutes: 600,
  },

  // [исследование: research/student-life.md — 26 ноября 2018 в корпусе Л
  // открылась столовая. Дословная реакция: «Это восхитительно».]
  canteenFinallyOpened: {
    id: 'canteenFinallyOpened',
    label: 'В корпусе Л открылась столовая — можно не выходить из здания',
    mood: 25,
    durationMinutes: 720,
  },

  // [допущение] До 26 ноября обед — это поход на Арму или вот это.
  lunchFromVendingMachine: {
    id: 'lunchFromVendingMachine',
    label: 'Пообедал шоколадкой из автомата',
    mood: -10,
    durationMinutes: 180,
  },

  // [дизайн-документ, §6.2] Двор и курилка — социальный хаб, снимает стресс.
  smokingBreakInTheYard: {
    id: 'smokingBreakInTheYard',
    label: 'Постоял во дворе в курилке',
    mood: 15,
    durationMinutes: 180,
  },

  // [исследование: research/building.md — Сад имени Н. Э. Баумана в 229 метрах]
  walkInBaumanGarden: {
    id: 'walkInBaumanGarden',
    label: 'Прошёлся по саду Баумана между парами',
    mood: 12,
    durationMinutes: 240,
  },

  // [исследование: research/building.md — гардероб электронный, самообслуживания
  // и «за тридевять земель» от входа]
  checkroomFarAway: {
    id: 'checkroomFarAway',
    label: 'Шёл до гардероба за тридевять земель',
    mood: -6,
    durationMinutes: 60,
  },

  // [исследование: research/student-life.md — «полтора часа на трёх видах
  // транспорта», общежития в Одинцове и Дубках]
  commuteFromDormitory: {
    id: 'commuteFromDormitory',
    label: 'Полтора часа на трёх видах транспорта',
    mood: -18,
    durationMinutes: 300,
  },

  // [допущение] Михайловский ловит на непрочитанном, дизайн-документ §7.2.
  cameUnprepared: {
    id: 'cameUnprepared',
    label: 'Пришёл на семинар, не открыв текст',
    mood: -20,
    durationMinutes: 240,
  },

  /*
   * Конец дня. Дизайн-документ, §3: день идёт с семи утра до двух ночи,
   * после чего персонаж вырубается где стоит, с большим штрафом.
   * Идентификатор первого объявлен в sim/daily/Sleep.ts: механика знает,
   * что ей нужен модификатор за такую ночь, но не знает, как он подписан.
   */

  // [дизайн-документ, §3] «После 02:00 персонаж вырубается где стоит».
  // Самый тяжёлый модификатор в игре — тяжелее провала на семинаре.
  passedOutWhereStanding: {
    id: 'passedOutWhereStanding',
    label: 'Отрубился где стоял',
    mood: -45,
    durationMinutes: 600,
  },

  // [допущение] Ночь на скамейке в коридоре второго этажа.
  sleptOnABench: {
    id: 'sleptOnABench',
    label: 'Ночевал на скамейке в коридоре',
    mood: -30,
    durationMinutes: 480,
  },

  // [допущение] Нормальная ночь. Единственный положительный модификатор сна:
  // выспаться — это не подвиг, а норма, поэтому и величина скромная.
  sleptInOwnBed: {
    id: 'sleptInOwnBed',
    label: 'Выспался в своей кровати',
    mood: 18,
    durationMinutes: 480,
  },

  /*
   * Воскресенье. Учебная неделя шестидневная (дизайн-документ, §3),
   * выходной один, и то, как он потрачен, помнится весь понедельник.
   */

  // [допущение] Проспать единственный выходной целиком.
  sleptThroughSunday: {
    id: 'sleptThroughSunday',
    label: 'Проспал воскресенье целиком',
    mood: 14,
    durationMinutes: 600,
  },

  // [допущение] Выходной, потраченный на текст.
  readAllSunday: {
    id: 'readAllSunday',
    label: 'Прочитал за воскресенье больше, чем за неделю',
    mood: 16,
    durationMinutes: 720,
  },

  // [допущение] Выходной, потраченный на эссе. Продуктивно и безрадостно.
  essayAllSunday: {
    id: 'essayAllSunday',
    label: 'Просидел единственный выходной над эссе',
    mood: -16,
    durationMinutes: 600,
  },

  // [исследование: research/student-life.md — «Symposy», винный бар на Арме,
  // назван от платоновского «Пира»; обеды от 250 рублей]
  wineAtSymposy: {
    id: 'wineAtSymposy',
    label: 'Пил вино в баре «Пир» на Арме',
    mood: 26,
    durationMinutes: 600,
  },
}
