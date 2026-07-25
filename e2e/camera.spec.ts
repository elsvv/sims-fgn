import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Управление камерой: зажатая левая кнопка вращает вид и не считается кликом.
 *
 * Проверка нужна именно в браузере. Полотно WebGL для браузера — один
 * элемент страницы, и событие `click` он выдаёт на любое нажатие с
 * отпусканием над сценой, сколько бы курсор ни проехал между ними.
 * Из-за этого вращение камеры доходило до сцены как клик: персонаж уходил
 * идти, разговор начинался сам собой, играть было нельзя. Юнит-тесты ловят
 * логику различения, но само это поведение браузера воспроизводит только
 * браузер.
 */

/** Доля пикселей, изменившихся между двумя кадрами. */
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
        if (!context) throw new Error('Не удалось получить 2D-контекст для сравнения кадров')
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

/**
 * Тащит мышь по ломаной через промежуточные точки — так же, как рука.
 *
 * `beforeRelease` вызывается, когда курсор доехал до последней точки, но
 * кнопка ещё зажата. Туда передают ожидание остановки камеры: камера едет
 * с инерцией и доворачивает ещё несколько секунд после того, как курсор
 * встал, а в проверке важно, над чем именно кнопку отпустили.
 */
async function drag(
  page: Page,
  path: readonly { x: number; y: number }[],
  beforeRelease?: () => Promise<void>,
): Promise<void> {
  const start = path[0]
  if (!start) throw new Error('Пустой путь протяжки')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (const point of path.slice(1)) {
    await page.mouse.move(point.x, point.y, { steps: 12 })
  }
  if (beforeRelease) await beforeRelease()
  const end = path[path.length - 1] ?? start
  await page.mouse.up()
  await page.mouse.move(end.x, end.y)
}

/**
 * Ждёт, пока камера остановится: инерция гасится постепенно, и сразу после
 * протяжки сцена ещё едет. Опора та же подпись над головой — пока она
 * ползёт по экрану, камера не встала.
 */
async function settleCamera(label: Locator): Promise<void> {
  let previous = Number.NaN
  for (let attempt = 0; attempt < 40; attempt++) {
    const box = await label.boundingBox()
    const x = box?.x ?? Number.NaN
    if (Number.isFinite(x) && Math.abs(x - previous) < 0.3) return
    previous = x
    await label.page().waitForTimeout(600)
  }
  throw new Error('камера так и не остановилась')
}

/**
 * Точка на фигуре преподавателя. Опора — подпись над головой: это обычный
 * элемент страницы с известными координатами, а человек висит прямо под ней.
 * Координаты берутся заново каждый раз: люди на этаже ходят.
 */
async function pointOnTeacher(label: Locator, lift: number): Promise<{ x: number; y: number }> {
  const box = await label.boundingBox()
  expect(box, 'подпись над преподавателем не нашлась').not.toBeNull()
  if (!box) throw new Error('подпись над преподавателем не нашлась')
  return { x: box.x + box.width / 2, y: box.y + box.height + lift }
}

/** Ждёт, пока сцена соберётся и нарисуется: на программном рендерере это долго. */
async function openGame(page: Page): Promise<Locator> {
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(6000)
  return canvas
}

test('зажатая левая кнопка вращает камеру, а не уводит персонажа', async ({ page }) => {
  const canvas = await openGame(page)
  const box = await canvas.boundingBox()
  expect(box, 'у канваса нет размеров на странице').not.toBeNull()
  if (!box) return

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  // --- Камера вращается ---
  const before = await canvas.screenshot()
  await drag(page, [center, { x: center.x + 220, y: center.y + 40 }])
  await page.waitForTimeout(600)
  const after = await canvas.screenshot()

  const rotated = await frameDifference(page, before, after)
  console.log('Кадр изменился после протяжки:', rotated.toFixed(3))
  expect(rotated, 'протяжка не повернула камеру').toBeGreaterThan(0.05)
  await page.screenshot({ path: 'screenshots/10-camera-rotated.png', fullPage: true })

  // --- Протяжка не считается кликом ---
  // Обратная протяжка возвращает камеру туда, где она была: угол поворота
  // считается по смещению курсора, а курсор вернулся в ту же точку.
  // Значит, и подпись над преподавателем вернётся на прежнее место.
  await drag(page, [{ x: center.x + 220, y: center.y + 40 }, center])

  const teacherLabel = page.locator('.npc-label', { hasText: 'Михайловский' })
  await expect(teacherLabel).toBeVisible()
  await settleCamera(teacherLabel)
  const dialogue = page.locator('.hud__dialogue')

  // Сначала находим, на сколько ниже подписи ловится сама фигура: высота
  // человека в пикселях зависит от удаления камеры. Заодно это проверка,
  // что обычный клик по преподавателю разговор начинает.
  let lift = 22
  for (const dy of [22, 30, 38, 46, 16]) {
    if ((await dialogue.count()) > 0) break
    lift = dy
    const point = await pointOnTeacher(teacherLabel, dy)
    await page.mouse.click(point.x, point.y)
    await page.waitForTimeout(400)
  }
  await expect(dialogue, 'клик по преподавателю перестал начинать разговор').toHaveCount(1)
  await dialogue.getByText('Промолчать и отойти').click()
  await expect(dialogue).toHaveCount(0)

  // Дальше время останавливается: преподаватели ходят по расписанию, и
  // сравнивать клик с протяжкой надо на неподвижной сцене, иначе человек
  // просто уйдёт из-под курсора и проверка окажется ни о чём.
  await page.locator('.speed-buttons button').first().click()
  await page.waitForTimeout(400)

  await settleCamera(teacherLabel)
  const spot = await pointOnTeacher(teacherLabel, lift)

  // Повторяем то же самое протяжкой: нажали на человеке, покрутили камеру,
  // вернули курсор ровно туда же и отпустили. Курсор вернулся — значит,
  // вернулась и камера, и отпустили снова на человеке.
  //
  // Крутим только по горизонтали: наклон упирается в ограничитель, и
  // обратный ход вернул бы не тот угол, с которого начали. Перед тем как
  // отпустить, дожидаемся остановки камеры — иначе кнопку отпустят посреди
  // инерционного доворота, когда человек уже уехал из-под курсора, и
  // проверка окажется ни о чём.
  await drag(page, [spot, { x: spot.x + 80, y: spot.y }, { x: spot.x - 80, y: spot.y }, spot], () =>
    settleCamera(teacherLabel),
  )
  await page.waitForTimeout(1200)

  const returned = await pointOnTeacher(teacherLabel, lift)
  expect(Math.abs(returned.x - spot.x), 'камера не вернулась по горизонтали').toBeLessThan(3)
  expect(Math.abs(returned.y - spot.y), 'камера не вернулась по вертикали').toBeLessThan(3)

  await expect(dialogue, 'вращение камеры над человеком начало разговор').toHaveCount(0)
  await page.screenshot({ path: 'screenshots/11-camera-drag-no-click.png', fullPage: true })

  // И тут же, не сходя с места, обычный клик. Он обязан сработать: во-первых,
  // порог отсекает протяжку, а не игрока; во-вторых, без этой проверки
  // предыдущая ничего не стоит — молчание могло бы значить, что курсор
  // просто мимо человека.
  await page.mouse.click(spot.x, spot.y)
  await page.waitForTimeout(600)
  await expect(dialogue, 'после протяжки перестал работать обычный клик').toHaveCount(1)
})

test('правая кнопка не открывает меню браузера, колесо приближает камеру', async ({ page }) => {
  const canvas = await openGame(page)
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return

  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

  const menuPrevented = await page.evaluate(() => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(menuPrevented, 'меню правой кнопки открывается поверх игры').toBe(true)

  const before = await canvas.screenshot()
  await page.mouse.move(center.x, center.y)
  await page.mouse.wheel(0, -600)
  await page.waitForTimeout(800)
  const after = await canvas.screenshot()

  const zoomed = await frameDifference(page, before, after)
  console.log('Кадр изменился после колеса:', zoomed.toFixed(3))
  expect(zoomed, 'колесо мыши не приближает камеру').toBeGreaterThan(0.05)

  // Страница при этом остаётся на месте: колесо принадлежит игре.
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  expect(scroll).toEqual({ x: 0, y: 0 })
})
