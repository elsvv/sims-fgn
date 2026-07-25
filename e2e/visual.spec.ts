import { expect, test, type Page } from '@playwright/test'

/**
 * Кадры для человека, который смотрит на игру глазами.
 *
 * Этот файл не проверяет механику — её проверяют соседние. Он снимает
 * пять кадров, по которым видно, как игра выглядит: этаж целиком, человек
 * вплотную, человек на ходу, аудитория во время пары и преподаватели рядом
 * друг с другом. Кадры лежат в screenshots/ и коммитятся: без них
 * «стало лучше или хуже» обсуждается по памяти.
 *
 * Проверки здесь всё равно есть, и не для вида. Кадр, снятый вслепую,
 * бесполезен: если в него не попадёт ни людей, ни обстановки, файл всё
 * равно запишется, и подмену заметят через неделю. Поэтому перед каждым
 * снимком проверяется то, ради чего он снят.
 */

/** Размер окна проверок — он же размер кадра. Задан в playwright.config.ts. */
const FRAME = { width: 1440, height: 900 }

/**
 * Камеру двигаем колесом и протяжкой — то есть ровно тем, чем её двигает
 * игрок. Другого способа нет: OrbitControls живут внутри канваса и наружу
 * ничего не отдают.
 *
 * Один щелчок колеса умножает расстояние на постоянный множитель, поэтому
 * «отъехать на десять щелчков» — величина неопределённая: она зависит от
 * того, где камера была. Отсюда приём, на котором держатся все кадры:
 * сначала колесо доводится до упора (minDistance или maxDistance в
 * GameCanvas), и только потом отсчитываются щелчки. От упора расстояние
 * выходит одно и то же при любом порядке съёмки.
 */
const TO_THE_STOP = 45

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

/** Щелчки колеса: dir −1 приближает, +1 отдаляет. */
async function zoom(page: Page, steps: number, dir: -1 | 1): Promise<void> {
  const box = await canvasBox(page)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dir * 120)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(500)
}

/** Протяжка левой кнопкой: вращение камеры вокруг цели. */
async function orbit(page: Page, dx: number, dy: number): Promise<void> {
  const box = await canvasBox(page)
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12)
    await page.waitForTimeout(15)
  }
  await page.mouse.up()
  await page.waitForTimeout(400)
}

/**
 * Панели интерфейса на время снимка убираются: они занимают все четыре
 * угла, а смотреть надо на сцену. Убираются не везде — там, где кадр
 * должен доказать «это происходит во время пары», интерфейс и есть
 * доказательство.
 */
async function hideHud(page: Page): Promise<() => Promise<void>> {
  const tag = await page.addStyleTag({
    content: '.hud > * { display: none !important }',
  })
  return async () => {
    // removeChild, а не remove: дескриптор типизирован как Node, а remove
    // объявлен только у Element.
    await tag.evaluate((node) => node.parentNode?.removeChild(node))
    await page.waitForTimeout(200)
  }
}

/** Ждёт, пока сцена соберётся: на программной отрисовке это долго. */
async function openFloor(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(9000)
  await expect(page.locator('.npc-label')).toHaveCount(6)
}

/** Фамилии, чьи подписи целиком поместились в кадр. */
async function labelsInFrame(page: Page): Promise<string[]> {
  const labels = page.locator('.npc-label')
  const total = await labels.count()
  const seen: string[] = []
  for (let index = 0; index < total; index++) {
    const label = labels.nth(index)
    const box = await label.boundingBox()
    if (!box) continue
    const inside =
      box.x > 0 &&
      box.y > 0 &&
      box.x + box.width < FRAME.width &&
      box.y + box.height < FRAME.height
    if (inside) seen.push((await label.textContent()) ?? '')
  }
  return seen
}

/** Доля пикселей, изменившихся между двумя кадрами канваса. */
async function frameDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]: [string, string]): Promise<number> => {
      async function pixels(source: string): Promise<ImageData> {
        const image = new Image()
        image.src = source
        await image.decode()
        const buffer = document.createElement('canvas')
        buffer.width = image.naturalWidth
        buffer.height = image.naturalHeight
        const context = buffer.getContext('2d')
        if (!context) throw new Error('нет 2D-контекста для сравнения кадров')
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, buffer.width, buffer.height)
      }
      const a = await pixels(first)
      const b = await pixels(second)
      if (a.data.length !== b.data.length) return 1
      let changed = 0
      for (let i = 0; i < a.data.length; i += 4) {
        const dr = Math.abs((a.data[i] ?? 0) - (b.data[i] ?? 0))
        const dg = Math.abs((a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0))
        const db = Math.abs((a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0))
        if (dr + dg + db > 24) changed++
      }
      return changed / (a.data.length / 4)
    },
    [
      `data:image/png;base64,${before.toString('base64')}`,
      `data:image/png;base64,${after.toString('base64')}`,
    ] as [string, string],
  )
}

test('этаж целиком, человек вплотную и человек на ходу', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await openFloor(page)
  const canvas = page.locator('canvas')

  /*
   * Крупный план — первым, и это не прихоть съёмки. Камера смотрит
   * в клетку появления, а не в персонажа: стоит ему отойти, и вплотную
   * будет виден пустой пол. Пока он не сходил с места, «вплотную»
   * и «на игрока» — одно и то же.
   */
  await page.locator('.speed-buttons button').first().click()
  await page.waitForTimeout(600)
  const showHud = await hideHud(page)
  await zoom(page, TO_THE_STOP, -1)

  /*
   * Кадр обрезается вокруг фигуры, и вырез считается, а не подобран
   * по пикселям. Цель камеры — клетка появления, то есть ровно то место,
   * где стоят ноги; в перспективе цель всегда приходится в центр кадра.
   * Значит, ступни в центре, а человек ростом 1.78 при ближнем упоре
   * (6 метров, fov 32°) занимает вверх примерно 400 точек из 450.
   */
  const closeUp = await canvasBox(page)
  await page.screenshot({
    path: 'screenshots/03-closeup.png',
    clip: {
      x: closeUp.x + closeUp.width / 2 - 280,
      y: closeUp.y + closeUp.height / 2 - 450,
      width: 560,
      height: 500,
    },
  })

  /*
   * Общий план — на дальнем упоре и без единого щелчка обратно.
   * Этаж 24×13 влезает в кадр целиком только оттуда: любой шаг вперёд
   * срезает восточный край с А-206 и лифтовым холлом, а вместе с ним
   * и Павлова, который только там и стоит.
   */
  await zoom(page, TO_THE_STOP, 1)
  await showHud()

  // Общий план обязан показывать этаж целиком — то есть всех шестерых
  // разом. Меньше шести значит, что камера смотрит в угол.
  const onOverview = await labelsInFrame(page)
  expect(
    onOverview.length,
    `на общем плане видно не весь этаж: ${onOverview.join(', ')}`,
  ).toBeGreaterThanOrEqual(6)
  await page.screenshot({ path: 'screenshots/01-scene.png' })

  /*
   * Человек на ходу. Камера ближе обычного — на одиннадцать щелчков от
   * ближнего упора, — потому что шаг видно только вблизи: с десяти
   * метров у фигуры различимы и разведённые ноги, и вынесенная вперёд
   * рука, а с двадцати это просто пятнышко, сдвинувшееся между кадрами.
   * Ближе одиннадцати щелчков лезть не стоит по другой причине: подписи
   * над головами живут в мире и растут вместе с приближением, и на
   * девяти щелчках фамилия соседа занимает треть верха кадра.
   *
   * Цель клика — пол коридора в паре метров западнее: за секунду с
   * небольшим персонаж успевает выйти в шаг и ещё не успевает уйти
   * из кадра.
   */
  await zoom(page, TO_THE_STOP, -1)
  await zoom(page, 11, 1)
  await page.locator('.speed-buttons button').nth(1).click()
  await page.waitForTimeout(400)

  const box = await canvasBox(page)
  const before = await canvas.screenshot()

  const menu = page.locator('.hud__menu')
  for (const [fx, fy] of [
    [0.36, 0.58],
    [0.32, 0.62],
    [0.4, 0.55],
  ] as const) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    await page.waitForTimeout(300)
    if ((await menu.count()) > 0) {
      await menu.getByText('Отмена', { exact: true }).click()
      continue
    }
    break
  }

  await page.waitForTimeout(1100)
  await page.screenshot({ path: 'screenshots/02-after-click.png' })

  const after = await canvas.screenshot()
  expect(
    await frameDifference(page, before, after),
    'после клика по полу картинка не изменилась — никто никуда не пошёл',
  ).toBeGreaterThan(0.0008)

  expect(
    consoleErrors.filter((text) => !text.includes('Download the React DevTools')),
    'браузер ругался в консоль',
  ).toEqual([])
})

/**
 * Точки в кадре, попадающие в обстановку А-204. Те же, что в sitting.spec:
 * и парта, и стул — трёхмерные предметы, а не элементы страницы, поэтому
 * кликать приходится по пикселю, а точек берётся несколько.
 */
const A204_SPOTS: readonly [number, number][] = [
  [0.64, 0.26],
  [0.62, 0.24],
  [0.6, 0.28],
  [0.58, 0.27],
  [0.56, 0.3],
  [0.54, 0.32],
  [0.52, 0.29],
]

test('аудитория во время пары: парты, стулья и преподаватель у доски', async ({ page }) => {
  await openFloor(page)

  // Тройная скорость: до девяти утра два игровых часа.
  await page.locator('.speed-buttons button').nth(3).click()

  const box = await canvasBox(page)

  // Садимся за парту. Сидящий в кадре важнее стоящего: пустая аудитория
  // с партами ничего не говорит о том, как в ней выглядит человек.
  let seated = false
  for (const [fx, fy] of A204_SPOTS) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    const menu = page.locator('.hud__menu')
    if ((await menu.count()) === 0) continue
    const item = menu.getByText('Занять место', { exact: true })
    if ((await item.count()) > 0) {
      await item.click()
      seated = true
      break
    }
    await menu.getByText('Отмена', { exact: true }).click()
  }
  expect(seated, 'не удалось сесть за парту в А-204').toBe(true)

  await expect(page.locator('.hud__activity')).toHaveCount(0, { timeout: 90_000 })
  await expect(page.locator('.hud__where')).toHaveText('Сейчас: А-204')

  // Ждём звонка: пара начинается сама, и вместе с ней в аудитории
  // появляется преподаватель у доски.
  const seminar = page.locator('.hud__seminar')
  await expect(seminar).toHaveCount(1, { timeout: 120_000 })
  await expect(seminar.locator('.hud__panel-title')).toContainText('Алиева')

  // Останавливаем время: кадр должен устояться, а не поймать всех в шаге.
  await page.locator('.speed-buttons button').first().click()
  await page.waitForTimeout(1200)

  /*
   * Камера. Аудитория лежит в шести метрах к северо-западу от цели —
   * от клетки появления в коридоре, — а цель у OrbitControls закреплена
   * и панорамирование выключено. Поэтому единственный способ увидеть
   * доску, парты и сидящего разом — отъехать: на двадцати с лишним
   * метрах аудитория целиком укладывается в верхнюю половину кадра.
   */
  await zoom(page, TO_THE_STOP, -1)
  await zoom(page, 21, 1)
  /*
   * Небольшой доворот вниз. Аудитория лежит дальше цели, и чем выше
   * камера, тем дальше от центра кадра уезжает всё, что за целью:
   * с поднятой камерой преподаватель у доски вылетает за верхний край
   * (проверено — проверка на «Алиева в кадре» краснеет). Опущенная,
   * наоборот, сжимает дальний план перспективой и втягивает доску
   * обратно в кадр.
   */
  await orbit(page, 0, -35)

  // Панели, не относящиеся к паре, на время снимка убираются. Панель
  // семинара и часы остаются: они и доказывают, что идёт пара, а не
  // пустая аудитория в семь утра.
  await page.addStyleTag({
    content: '.hud > *:not(.hud__seminar):not(.hud__time) { display: none !important }',
  })
  await page.waitForTimeout(400)

  // Преподаватель действительно в кадре, а не за краем.
  expect(await labelsInFrame(page), 'Алиевой нет в кадре аудитории').toContain('Алиева')

  await page.screenshot({ path: 'screenshots/04-classroom.png' })
})

test('преподаватели рядом: различимы ли они между собой', async ({ page }) => {
  await openFloor(page)

  // Время стоит: люди расходятся по расписанию, а сравнивать их надо
  // на неподвижном кадре.
  await page.locator('.speed-buttons button').first().click()
  await page.waitForTimeout(800)
  await hideHud(page)

  /*
   * Расстояние не назначено числом, а найдено: камера начинает у ближнего
   * упора и отъезжает щелчок за щелчком, пока в кадр не поместятся хотя бы
   * пятеро. Так кадр получается самым крупным из тех, где сравнивать
   * вообще есть кого.
   *
   * Число «пятеро», а не «шестеро», не от лени. Пятеро преподавателей
   * ждут своей пары в коридоре, а Павлов не преподаёт на первом курсе
   * и стоит в лифтовом холле, в четырнадцати метрах от середины (см.
   * content/people/npcs.ts). Требовать шестерых — значит требовать
   * дальнего упора, а там фигура высотой в сорок точек, и вопрос
   * «различимы ли» теряет смысл сам собой. Шестеро вместе есть
   * на общем плане, 01-scene.
   */
  await zoom(page, TO_THE_STOP, -1)
  let seen: string[] = []
  for (let step = 0; step < TO_THE_STOP; step++) {
    seen = await labelsInFrame(page)
    if (seen.length >= 5) break
    await zoom(page, 1, 1)
  }
  expect(
    seen.length,
    `в кадр так и не попало пятерых, сравнивать нечего: ${seen.join(', ')}`,
  ).toBeGreaterThanOrEqual(5)

  await page.screenshot({ path: 'screenshots/05-teachers.png' })
})
