import { expect, test, type Page } from '@playwright/test'

/**
 * Прохождение глазами игрока: первый взгляд, камера, дорога, кофе,
 * разговор по пути.
 *
 * Соседние файлы проверяют по механике на файл — семинар, сохранения,
 * посадку на стул. Этот проверяет швы между ними: то, что видно только
 * когда играешь подряд, а не запускаешь одну проверку. Все три находки,
 * ради которых он написан, нашлись именно так: подсказки в начале не было
 * вовсе, разговор по прибытии не начинался, а панель людей называла
 * незнакомым того, с кем игрок только что поговорил.
 */

/** Сколько ждать, пока three.js соберёт сцену на программной отрисовке. */
const SCENE_READY_MS = 7000

/**
 * Точки в кадре, попадающие на пол А-204, — доли ширины и высоты канваса.
 * Те же, что в seminar.spec: пол — трёхмерная плоскость, а не элемент
 * страницы, и целиться приходится по пикселю.
 */
const A204_SPOTS: readonly [number, number][] = [
  [0.56, 0.3],
  [0.58, 0.27],
  [0.62, 0.24],
  [0.54, 0.32],
]

interface Box {
  x: number
  y: number
  width: number
  height: number
}

async function canvasBox(page: Page): Promise<Box> {
  const box = await page.locator('canvas').boundingBox()
  expect(box, 'у канваса нет размеров').not.toBeNull()
  if (!box) throw new Error('нет канваса')
  return box
}

async function openFloor(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(SCENE_READY_MS)
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Закрывает всё, что могло открыться от случайного попадания. */
async function closeAnything(page: Page): Promise<void> {
  const menu = page.locator('.hud__menu')
  if ((await menu.count()) > 0) {
    await menu.getByText('Отмена', { exact: true }).click({ force: true })
    await page.waitForTimeout(80)
  }
  const dialogue = page.locator('.hud__dialogue')
  for (let i = 0; i < 4 && (await dialogue.count()) > 0; i++) {
    const quiet = dialogue.getByText('Промолчать и отойти', { exact: true })
    const next = dialogue.getByText('Продолжить', { exact: true })
    if ((await quiet.count()) > 0) await quiet.click({ force: true })
    else if ((await next.count()) > 0) await next.click({ force: true })
    else break
    await page.waitForTimeout(150)
  }
}

/**
 * Ищет предмет, прощупывая кадр сеткой и читая заголовок открывшегося меню.
 *
 * Так, а не по заранее записанным точкам, по одной причине: кадр к этому
 * моменту уже повёрнут и отодвинут — ровно как у игрока, который
 * осмотрелся. Записанные точки пришлось бы переписывать после каждой
 * правки камеры, а поиск переживает её сам.
 */
async function findProp(page: Page, title: string): Promise<{ x: number; y: number } | null> {
  const box = await canvasBox(page)
  const cols = 26
  const rows = 18
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = box.x + ((ix + 0.5) / cols) * box.width
      const y = box.y + ((iy + 0.5) / rows) * box.height
      await page.mouse.click(x, y)
      await page.waitForTimeout(55)
      const menu = page.locator('.hud__menu')
      if ((await menu.count()) > 0) {
        const found = (await menu.locator('.hud__menu-title').textContent()) ?? ''
        if (found === title) return { x, y }
      }
      await closeAnything(page)
    }
  }
  return null
}

test('первый взгляд: понятно, что делать, и панели не мешают друг другу', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await openFloor(page)

  // --- Подсказка ---
  // Управление здесь не общепринятое: вид вращают той же кнопкой, которой
  // ходят. Игрок, которому этого не сказали, первым делом решает,
  // что камера сломана.
  const hint = page.locator('.hud__hintcard')
  await expect(hint, 'в начале игры нет ни слова о том, что делать').toHaveCount(1)
  await expect(hint).toContainText('Потянуть мышью')
  await expect(hint).toContainText('Щелчок по полу')
  await expect(hint).toContainText('Щелчок по человеку')
  await expect(hint).toContainText('Щелчок по предмету')
  // И ответ на главный вопрос первокурсника: куда идти.
  await expect(hint).toContainText('расписании')

  await page.screenshot({ path: 'screenshots/50-start-with-hint.png', fullPage: true })

  // --- Ожидание названо словами ---
  // «Следующая пара через 112 мин» — это показание прибора: игрок читает
  // его, вычитает в уме и получает «часа два». Точное время начала стоит
  // строкой выше, в самой строке пары.
  // Числа в строке остаются только в номере аудитории — там они и в жизни
  // числа. Само ожидание обязано быть словом.
  const next = page.locator('.hud__next')
  await expect(next).toHaveText(/^Следующая пара через [а-яё ]+, /)
  await expect(page.locator('.lesson__time').first()).toHaveText(/^\d{2}:\d{2}/)

  // --- Панели делят экран ---
  // Подсказка стоит внизу по центру и обязана уживаться со всеми,
  // кто уже занял углы.
  const selectors = [
    '.hud__needs',
    '.hud__schedule',
    '.hud__time',
    '.hud__skills',
    '.hud__people',
    '.hud__gamemenu',
    '.hud__audio',
    '.hud__hintcard',
  ]
  const boxes = await Promise.all(selectors.map((s) => page.locator(s).boundingBox()))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      expect(a, `панель ${selectors[i]} не нашлась`).not.toBeNull()
      expect(b, `панель ${selectors[j]} не нашлась`).not.toBeNull()
      if (!a || !b) continue
      expect(overlaps(a, b), `${selectors[i]} перекрывает ${selectors[j]}`).toBe(false)
    }
  }

  // --- Середина кадра принадлежит игре ---
  /*
   * Панель, накрывшая человека, не просто мешает смотреть: нажатие по
   * нему достаётся ей, и для игрока это выглядит как «клик не работает».
   * Так и было: «Шкала традиций» стояла вверху по центру, ровно над
   * коридором, и глотала нажатия по Михайловскому — стоя при этом под
   * собственной подписью «нажмите на преподавателя в коридоре».
   *
   * Правило поэтому такое: углы принадлежат интерфейсу, средняя треть
   * по горизонтали — сцене. Требовать, чтобы панели не задевали вообще
   * никого, бессмысленно: люди ходят по всему этажу, а нижние углы
   * кадра — это восточный и западный концы коридора, и любая панель
   * в углу однажды окажется над кем-нибудь.
   *
   * Проверяются подписи, а не фигуры: подпись — это элемент страницы
   * с известными координатами, а фигура висит прямо под ней.
   */
  const middle = { x: 1440 / 3, y: 0, width: 1440 / 3, height: 900 }
  const labels = page.locator('.npc-label')
  for (let index = 0; index < (await labels.count()); index++) {
    const label = labels.nth(index)
    const labelBox = await label.boundingBox()
    if (!labelBox || !overlaps(labelBox, middle)) continue
    const name = await label.textContent()
    for (let i = 0; i < boxes.length; i++) {
      const panel = boxes[i]
      if (!panel) continue
      expect(
        overlaps(panel, labelBox),
        `панель ${selectors[i]} лежит на подписи «${name}» посреди кадра и съест нажатие по нему`,
      ).toBe(false)
    }
  }

  // --- Подсказка уходит от первого же шага ---
  const box = await canvasBox(page)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.54)
  await expect(hint, 'подсказка осталась висеть после первого шага').toHaveCount(0, {
    timeout: 15_000,
  })

  expect(
    consoleErrors.filter((text) => !text.includes('Download the React DevTools')),
    'браузер ругался в консоль',
  ).toEqual([])
})

test('подошёл — заговорил: второго нажатия не требуется', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await openFloor(page)

  const where = page.locator('.hud__where')
  const box = await canvasBox(page)

  // Уходим в аудиторию — то есть заведомо далеко от коридора, где стоят
  // преподаватели. Отсюда разговор начаться не может ни при каких условиях:
  // между вами стена.
  let inClass = false
  for (const [fx, fy] of A204_SPOTS) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    if ((await page.locator('.hud__menu').count()) > 0) {
      await page.locator('.hud__menu').getByText('Отмена', { exact: true }).click()
      continue
    }
    try {
      await expect.poll(async () => where.textContent(), { timeout: 12_000 }).toBe('Сейчас: А-204')
      inClass = true
      break
    } catch {
      /* пробуем следующую точку */
    }
  }
  expect(inClass, 'не удалось увести персонажа в А-204').toBe(true)

  // --- Одно нажатие на человека в другом помещении ---
  const label = page.locator('.npc-label', { hasText: 'Михайловский' })
  await expect(label).toBeVisible()
  const labelBox = await label.boundingBox()
  expect(labelBox, 'подпись над Михайловским не нашлась').not.toBeNull()
  if (!labelBox) return

  const dialogue = page.locator('.hud__dialogue')
  for (const dy of [22, 30, 38, 46, 16]) {
    if ((await dialogue.count()) > 0) break
    await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height + dy)
    // Ждём долго и нарочно: персонажу надо выйти из аудитории и пройти
    // полкоридора. Второго нажатия здесь нет — в этом весь смысл проверки.
    await expect(dialogue)
      .toHaveCount(1, { timeout: 30_000 })
      .catch(() => undefined)
  }

  await expect(
    dialogue,
    'персонаж дошёл до собеседника и встал молча: разговор требует второго нажатия',
  ).toHaveCount(1)
  await expect(dialogue.locator('.dialogue__speaker')).toHaveText(
    'Михайловский Александр Владиславович',
  )
  await page.screenshot({ path: 'screenshots/51-talk-on-arrival.png', fullPage: true })

  // --- Разговор без последствий — тоже разговор ---
  // Самый безобидный ответ: он не двигает ни уважения, ни симпатии.
  // Раньше после него панель людей отвечала «вы ещё ни с кем не говорили».
  const people = page.locator('.hud__people')
  await dialogue.getByText('Сказать, что просто ждёте пару.').click()
  await expect(dialogue.locator('.dialogue__reply')).not.toBeEmpty()
  await dialogue.getByText('Продолжить', { exact: true }).click()
  await expect(dialogue).toHaveCount(0)

  await expect(
    people,
    'панель людей уверяет, что разговора не было',
  ).not.toContainText('Вы ещё ни с кем не говорили')
  const met = people.locator('.person', { hasText: 'Михайловский' })
  await expect(met).toHaveCount(1)
  await expect(met.locator('.person__standing-text')).toHaveText('Поговорили, и только')
  // И не «Незнакомы» рядом с этой фразой: формально верно, читается
  // противоречием.
  await expect(met.locator('.person__level')).toHaveText('Едва знакомы')
  // Числами в этой панели по-прежнему не разговаривают.
  expect(await met.innerText(), 'в списке людей появилось число').not.toMatch(/\d/)

  await page.screenshot({ path: 'screenshots/52-people-after-talk.png', fullPage: true })

  /*
   * Список людей растёт с каждым знакомством, а расти ему некуда: под ним
   * в том же столбце навыки. Проверяется не сегодняшний список из одного
   * человека, а потолок высоты: в панель дописываются строки, каких в игре
   * ещё не бывало, — со всеми шестью преподавателями и однокурсниками
   * так и будет.
   */
  await page.locator('.hud__people').evaluate((panel) => {
    for (let i = 0; i < 12; i++) {
      const row = document.createElement('div')
      row.className = 'person'
      row.textContent = 'Проверка высоты'
      panel.append(row)
    }
  })
  const peopleBox = await page.locator('.hud__people').boundingBox()
  const skillsBox = await page.locator('.hud__skills').boundingBox()
  expect(peopleBox).not.toBeNull()
  expect(skillsBox).not.toBeNull()
  if (peopleBox && skillsBox) {
    expect(
      overlaps(peopleBox, skillsBox),
      'разросшийся список людей наехал на навыки',
    ).toBe(false)
  }

  expect(
    consoleErrors.filter((text) => !text.includes('Download the React DevTools')),
    'браузер ругался в консоль',
  ).toEqual([])
})

test('дорога за кофе: камера, автомат и выросшая нужда', async ({ page }) => {
  await openFloor(page)

  const box = await canvasBox(page)
  const where = page.locator('.hud__where')
  const roomBefore = await where.textContent()

  // --- Камера ---
  // Протяжка левой кнопкой вращает вид и не отдаёт команду идти.
  const from = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.6 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x - i * 18, from.y - i * 3)
    await page.waitForTimeout(25)
  }
  await page.mouse.up()
  await page.waitForTimeout(1000)

  await expect(page.locator('.hud__menu'), 'протяжка открыла меню предмета').toHaveCount(0)
  await expect(page.locator('.hud__dialogue'), 'протяжка начала разговор').toHaveCount(0)
  await expect(where, 'персонаж пошёл от вращения камеры').toHaveText(String(roomBefore))

  // Колесо отодвигает камеру: автоматы у стены коридора в стартовый кадр
  // не помещаются, и без этого до них не дотянуться мышью.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(700)

  // --- Кофе ---
  const energyValue = async (): Promise<number> => {
    const row = page.locator('.hud__needs .need', { hasText: 'Энергия' })
    return Number(await row.locator('.need__label span').nth(1).textContent())
  }
  const before = await energyValue()

  const coffee = await findProp(page, 'Кофейный автомат')
  expect(coffee, 'кофейный автомат не нашёлся в кадре').not.toBeNull()
  if (!coffee) return

  await page.mouse.click(coffee.x, coffee.y)
  const menu = page.locator('.hud__menu')
  await expect(menu).toHaveCount(1)
  await expect(menu.locator('.hud__menu-title')).toHaveText('Кофейный автомат')
  await menu.getByText('Взять кофе', { exact: true }).click()

  // Персонаж идёт к автомату и стоит у него положенное время; подпись
  // действия висит всё это время и исчезает вместе с ним.
  await expect(page.locator('.hud__activity')).toHaveText('Взять кофе')
  await expect(page.locator('.hud__activity')).toHaveCount(0, { timeout: 90_000 })

  await expect
    .poll(async () => energyValue(), { timeout: 30_000 })
    .toBeGreaterThan(before)

  await page.screenshot({ path: 'screenshots/53-coffee.png', fullPage: true })
})

test('сохранение переживает перезагрузку страницы', async ({ page }) => {
  /*
   * save.spec проверяет круг «сохранить — загрузить» внутри одной
   * страницы. Игрок так не делает: он закрывает вкладку и возвращается
   * назавтра. Между этими двумя случаями лежит всё, что живёт в памяти
   * вкладки, а не в localStorage, — и проверить это можно только
   * настоящей перезагрузкой.
   */
  await openFloor(page)

  // Уводим персонажа с места появления, чтобы в сохранении было что
  // отличать от новой партии.
  const box = await canvasBox(page)
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.54)
  await page.waitForTimeout(2500)

  await page.locator('.hud__gamemenu').click()
  const slots = page.locator('.saveslot')
  await slots.nth(1).getByText('Сохранить').click()
  await expect(page.locator('.savemenu__notice')).toContainText('Игра сохранена')

  const savedAt = await page.locator('.hud__clock').textContent()
  const savedWhere = await page.locator('.hud__where').textContent()
  expect(savedAt).toMatch(/^\d{2}:\d{2}$/)

  await page.getByText('Вернуться в игру').click()

  // --- Перезагрузка ---
  await page.reload()
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(SCENE_READY_MS)

  // Новая вкладка начинает с понедельничного утра: сохранение само
  // не подхватывается, и это правильно — загрузку выбирает игрок.
  await expect(page.locator('.hud__day')).toHaveText('Неделя 1, понедельник')

  await page.locator('.hud__gamemenu').click()
  await expect(
    slots.nth(1).locator('.saveslot__when'),
    'после перезагрузки слот опустел',
  ).toContainText(String(savedAt))
  await slots.nth(1).getByText('Загрузить').click()

  await expect(page.locator('.savemenu')).toHaveCount(0)
  await expect(page.locator('.hud__clock')).toHaveText(String(savedAt))
  await expect(page.locator('.hud__where')).toHaveText(String(savedWhere))

  await page.screenshot({ path: 'screenshots/55-loaded-after-reload.png', fullPage: true })
})

test('конец дня: лечь на скамейку и прочитать, как день прошёл', async ({ page }) => {
  await openFloor(page)

  const box = await canvasBox(page)

  // Скамейка стоит в восточном конце коридора и в стартовый кадр не
  // попадает вовсе — до неё надо сначала отъехать камерой. Это и есть
  // причина, по которой предупреждение об отбое теперь называет место
  // для ночлега вслух: найти его самому неоткуда.
  // Отъезжаем: скамейка стоит в восточном конце коридора, в стартовый
  // кадр не попадает вовсе.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 14; i++) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(700)

  /*
   * Панель навыков на время поиска убирается, и это не удобство проверки,
   * а обход найденной беды. Камера смотрит в клетку появления и за
   * персонажем не идёт, поэтому восточный конец коридора всегда уезжает
   * в правый нижний угол кадра — ровно туда, где живут навыки. Скамейка
   * при отъезде на четырнадцать щелчков ловится мышью в полосе шириной
   * в несколько пикселей между краем панели и краем экрана. Подробности
   * и способ воспроизведения — в docs/known-issues.md.
   */
  const hidden = await page.addStyleTag({
    content: '.hud__skills, .hud__needs { display: none !important }',
  })

  const bench = await findProp(page, 'Скамейка в коридоре')
  await hidden.evaluate((node) => node.parentNode?.removeChild(node))
  expect(bench, 'скамейка — единственное место для сна — не нашлась в кадре').not.toBeNull()
  if (!bench) return

  await page.mouse.click(bench.x, bench.y)
  const menu = page.locator('.hud__menu')
  await expect(menu).toHaveCount(1)
  // «Лечь спать» стоит в том же меню, что и «посидеть», но это не такое же
  // действие: им кончается день.
  const sleep = menu.getByText('Лечь спать прямо здесь', { exact: true })
  await expect(sleep).toHaveCount(1)
  await expect(menu.locator('.hud__menu-item--sleep .hud__menu-time')).toHaveText('до утра')
  /*
   * Сейчас начало восьмого утра, и «до утра» означает двадцать три часа.
   * Механика такая и была, но узнать об этом из подписи «до утра» было
   * нельзя: игрок ложился из любопытства и терял день целиком, все пары
   * уходили в прогулы, а нужды к утру оказывались на нуле.
   */
  await expect(menu.locator('.hud__menu-note')).toContainText('пропустите всё сегодняшнее')
  await expect(menu.locator('.hud__menu-note')).toContainText('часа')
  await sleep.click()

  // Персонаж идёт к скамейке и укладывается; день кончается сам.
  await page.locator('.speed-buttons button').nth(3).click()
  const dayScreen = page.locator('.dayscreen')
  await expect(dayScreen).toHaveCount(1, { timeout: 120_000 })

  await expect(dayScreen.locator('.dayscreen__kicker')).toHaveText('День прожит')
  await expect(dayScreen.locator('.dayscreen__title')).toHaveText('Неделя 1, понедельник')
  // Рассказ, а не таблица приращений: про пары, про сон и без единой
  // строчки вида «энергия +40».
  const story = await dayScreen.innerText()
  expect(story).toContain('скамейке')
  expect(story, 'итоги дня печатают приращения числами').not.toMatch(/[+−]\s*\d/)

  await page.screenshot({ path: 'screenshots/54-day-summary.png', fullPage: true })

  await dayScreen.getByText('Дальше', { exact: true }).click()
  await expect(dayScreen).toHaveCount(0)
  await expect(page.locator('.hud__day')).toHaveText('Неделя 1, вторник')
})
