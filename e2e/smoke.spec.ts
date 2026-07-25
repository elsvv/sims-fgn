import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Дымовой тест на то, что игра действительно рисуется.
 *
 * Смысл файла — не «страница открылась без ошибок», а «в кадре есть картинка».
 * Сборка может пройти, React смонтироваться, canvas появиться в DOM — и при
 * этом на экране будет чёрный прямоугольник. Поэтому кадр разбирается по
 * пикселям, и однотонная заливка считается провалом.
 */

interface FrameStats {
  width: number
  height: number
  /** Сколько различимых цветов в кадре (квантование по 5 бит на канал). */
  distinctColors: number
  /** Доля самого частого цвета. Близко к 1 — экран однотонный. */
  dominantShare: number
  /** Доля пикселей, совпадающих с цветом очистки сцены. */
  backgroundShare: number
  /** Доля заметно светлых пикселей: пол и стены должны их дать. */
  brightShare: number
  meanLuma: number
  /** Разброс яркости. У однотонной заливки он нулевой. */
  lumaDeviation: number
}

/**
 * Снимает пиксели канваса. Скриншот берётся средствами браузера, а не через
 * canvas.toDataURL: у WebGL-контекста preserveDrawingBuffer выключен, и
 * прямое чтение буфера вернуло бы пустоту. Готовый PNG декодируется обратно
 * в 2D-канвас уже внутри страницы, чтобы получить массив пикселей.
 */
async function readFrame(page: Page, canvas: Locator): Promise<FrameStats> {
  const png = await canvas.screenshot()
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`

  return page.evaluate(async (source: string): Promise<FrameStats> => {
    const image = new Image()
    image.src = source
    await image.decode()

    const buffer = document.createElement('canvas')
    buffer.width = image.naturalWidth
    buffer.height = image.naturalHeight
    const context = buffer.getContext('2d')
    if (!context) throw new Error('Не удалось получить 2D-контекст для разбора кадра')
    context.drawImage(image, 0, 0)

    const { data } = context.getImageData(0, 0, buffer.width, buffer.height)
    const total = buffer.width * buffer.height

    const histogram = new Map<number, number>()
    let background = 0
    let bright = 0
    let lumaSum = 0
    let lumaSquares = 0

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0
      const g = data[i + 1] ?? 0
      const b = data[i + 2] ?? 0

      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
      histogram.set(key, (histogram.get(key) ?? 0) + 1)

      if (Math.abs(r - 0x0f) <= 10 && Math.abs(g - 0x11) <= 10 && Math.abs(b - 0x16) <= 10) {
        background++
      }

      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
      if (luma > 90) bright++
      lumaSum += luma
      lumaSquares += luma * luma
    }

    let dominant = 0
    for (const count of histogram.values()) if (count > dominant) dominant = count

    const meanLuma = lumaSum / total
    const variance = Math.max(0, lumaSquares / total - meanLuma * meanLuma)

    return {
      width: buffer.width,
      height: buffer.height,
      distinctColors: histogram.size,
      dominantShare: dominant / total,
      backgroundShare: background / total,
      brightShare: bright / total,
      meanLuma,
      lumaDeviation: Math.sqrt(variance),
    }
  }, dataUrl)
}

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

test('сцена этажа рисуется, интерфейс на месте, персонаж ходит по клику', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')

  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()

  // three.js нужно время: собрать сцену, скомпилировать шейдеры,
  // отрисовать карту теней. На программном рендерере это небыстро.
  await page.waitForTimeout(6000)

  // --- Интерфейс ---
  const clock = page.locator('.hud__clock')
  await expect(clock).toHaveText(/^\d{2}:\d{2}$/)

  await expect(page.locator('.hud__day')).toHaveText('Неделя 1, понедельник')

  const needs = page.locator('.hud__needs')
  await expect(needs.getByText('Энергия', { exact: true })).toBeVisible()
  await expect(needs.getByText('Спокойствие', { exact: true })).toBeVisible()

  // Расписание связано с миром: панель знает и про пары, и про то,
  // в каком помещении стоит персонаж.
  const schedule = page.locator('.hud__schedule')
  await expect(schedule.getByText('Расписание на сегодня')).toBeVisible()
  await expect(schedule.locator('.lesson')).toHaveCount(2)
  await expect(schedule.locator('.lesson__room').first()).toHaveText('А-204')
  await expect(schedule.locator('.hud__where')).toHaveText('Сейчас: коридор')

  // Этаж обитаем: шестеро преподавателей стоят в сцене и подписаны фамилиями.
  const labels = page.locator('.npc-label')
  await expect(labels).toHaveCount(6)
  expect((await labels.allTextContents()).sort()).toEqual(
    ['Алиева', 'Долгоруков', 'Кречетова', 'Марей', 'Михайловский', 'Павлов'].sort(),
  )

  const speedButtons = page.locator('.speed-buttons button')
  await expect(speedButtons).toHaveCount(4)
  await expect(speedButtons.nth(1)).toHaveAttribute('data-active', 'true')

  // Навыки и модификаторы настроения — правый нижний угол.
  const skills = page.locator('.hud__skills')
  await expect(skills.getByText('Навыки', { exact: true })).toBeVisible()
  await expect(skills.locator('.skill')).toHaveCount(6)
  await expect(skills.getByText('Древние языки', { exact: true })).toBeVisible()
  await expect(skills.getByText('Выносливость', { exact: true })).toBeVisible()
  await expect(skills.getByText('Настроение', { exact: true })).toBeVisible()
  await expect(skills.locator('.moodlet__empty')).toBeVisible()

  // Люди: шкала традиций на месте, знакомств пока нет.
  const people = page.locator('.hud__people')
  await expect(people.getByText('Шкала традиций', { exact: true })).toBeVisible()
  await expect(people.locator('.faction__label')).toHaveText('Ещё не определился')
  await expect(people.locator('.person')).toHaveCount(0)

  // Панели делят углы и не наезжают друг на друга. Проверяется геометрией,
  // а не на глаз: стоит панели подрасти, и тест это поймает.
  const panelSelectors = [
    '.hud__needs',
    '.hud__schedule',
    '.hud__time',
    '.hud__skills',
    '.hud__people',
  ]
  const panelBoxes = await Promise.all(
    panelSelectors.map((selector) => page.locator(selector).boundingBox()),
  )

  for (let i = 0; i < panelBoxes.length; i++) {
    for (let j = i + 1; j < panelBoxes.length; j++) {
      const a = panelBoxes[i]
      const b = panelBoxes[j]
      expect(a, `панель ${panelSelectors[i]} не нашлась`).not.toBeNull()
      expect(b, `панель ${panelSelectors[j]} не нашлась`).not.toBeNull()
      if (!a || !b) continue

      const overlaps =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      expect(overlaps, `${panelSelectors[i]} перекрывает ${panelSelectors[j]}`).toBe(false)
    }
  }

  // Часы должны идти, иначе игровой цикл не крутится.
  const firstTime = await clock.textContent()
  await expect
    .poll(async () => clock.textContent(), { timeout: 30_000 })
    .not.toBe(firstTime)

  // --- Кадр ---
  const box = await canvas.boundingBox()
  expect(box, 'у канваса нет размеров на странице').not.toBeNull()
  if (!box) return
  expect(box.width).toBeGreaterThan(600)
  expect(box.height).toBeGreaterThan(400)

  const before = await canvas.screenshot()
  await page.screenshot({ path: 'screenshots/01-scene.png', fullPage: true })

  const frame = await readFrame(page, canvas)
  const report = JSON.stringify(frame)
  console.log('Разбор кадра:', report)

  // Главная проверка: в кадре есть изображение, а не заливка.
  // Пороги стоят между двумя измеренными состояниями. Отрисованный этаж даёт
  // ~417 различимых цветов, доминанту 0.59, яркость 65 и разброс 68. Та же
  // страница со снятой геометрией — 109 цветов, доминанту 0.93, яркость 19 и
  // разброс 16, то есть валит каждую из шести проверок.
  expect(frame.distinctColors, `кадр почти одноцветный: ${report}`).toBeGreaterThan(250)
  expect(frame.dominantShare, `один цвет занимает почти весь кадр: ${report}`).toBeLessThan(0.8)
  expect(frame.backgroundShare, `виден только фон сцены #0f1116: ${report}`).toBeLessThan(0.85)
  expect(frame.meanLuma, `кадр слишком тёмный: ${report}`).toBeGreaterThan(35)
  expect(frame.lumaDeviation, `яркость не меняется по кадру: ${report}`).toBeGreaterThan(35)
  // Пол и стены светлые: без них освещённой геометрии в кадре нет.
  expect(frame.brightShare, `в кадре нет освещённой геометрии: ${report}`).toBeGreaterThan(0.12)

  expect(
    consoleErrors.filter((text) => !text.includes('Download the React DevTools')),
    'браузер ругался в консоль',
  ).toEqual([])

  // --- Разговор с преподавателем ---
  // По человеку надо попасть мышью в трёхмерной сцене. Опорой служит подпись
  // над головой: это обычный элемент страницы, его координаты известны точно,
  // а фигура висит прямо под ним. Высота фигуры в пикселях зависит от
  // удаления камеры, поэтому пробуем несколько смещений вниз.
  const teacherLabel = page.locator('.npc-label', { hasText: 'Михайловский' })
  await expect(teacherLabel).toBeVisible()
  const labelBox = await teacherLabel.boundingBox()
  expect(labelBox, 'подпись над Михайловским не нашлась').not.toBeNull()

  const dialogue = page.locator('.hud__dialogue')
  if (labelBox) {
    for (const dy of [22, 30, 38, 46, 16]) {
      if ((await dialogue.count()) > 0) break
      await page.mouse.click(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height + dy)
      await page.waitForTimeout(400)
    }
  }

  await expect(dialogue, 'клик по преподавателю не начал разговор').toHaveCount(1)
  await expect(dialogue.locator('.dialogue__speaker')).toHaveText(
    'Михайловский Александр Владиславович',
  )
  await expect(dialogue.locator('.dialogue__prompt')).not.toBeEmpty()

  // В меню всегда есть чем ответить, и уйти можно, ничего не сказав.
  const answers = dialogue.locator('.dialogue__option')
  expect(await answers.count()).toBeGreaterThanOrEqual(2)
  await expect(dialogue.getByText('Промолчать и отойти')).toBeVisible()

  await page.screenshot({ path: 'screenshots/03-dialogue.png', fullPage: true })

  // Дерзкий ответ: собеседник отвечает, а отношения меняются на глазах.
  await dialogue.getByText('Сказать, что герменевтика').click()
  await expect(dialogue.locator('.dialogue__reply')).toContainText('Смело')
  await expect(answers).toHaveCount(0)

  await page.screenshot({ path: 'screenshots/04-dialogue-reply.png', fullPage: true })

  await dialogue.getByText('Продолжить', { exact: true }).click()
  await expect(dialogue).toHaveCount(0)

  const met = people.locator('.person', { hasText: 'Михайловский' })
  await expect(met).toHaveCount(1)

  // Отношения показаны словами: симпатия за дерзость выросла, уважение
  // упало, и ни одного числа в строке нет.
  const standings = met.locator('.person__standing')
  await expect(standings).toHaveCount(2)
  await expect(standings.nth(0)).toContainText('Симпатия: к вам скорее тепло')
  await expect(standings.nth(1)).toContainText('Уважение: держат за слабого')
  expect(await met.innerText(), 'в списке людей появилось число').not.toMatch(/\d/)

  // Дерзость перед самым континентальным человеком факультета сносит
  // игрока в аналитическую сторону — метка уходит левее середины.
  await expect(people.locator('.faction__label')).toHaveText('Ещё не определился')
  const markLeft = await people.locator('.faction__mark').evaluate((node) => node.style.left)
  expect(Number.parseFloat(markLeft)).toBeLessThan(50)

  // --- Клик по полу ---
  // Бьём в свободный пол блока туалетов — он в левой нижней части кадра.
  // Ровно в центр кадра целиться нельзя: туда наведена камера, а значит там
  // стоит сам персонаж, и команда идти в свою же клетку ничего не изменит.
  // До туалетов путь ведёт через дверной проём, так что заодно видно,
  // что работает поиск пути.
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.54)

  await page.waitForTimeout(500)
  await expect(page.locator('.hud__menu'), 'клик попал в предмет, а не в пол').toHaveCount(0)

  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'screenshots/02-after-click.png', fullPage: true })

  const after = await canvas.screenshot()
  const moved = await frameDifference(page, before, after)
  expect(moved, 'после клика по полу картинка не изменилась — персонаж не пошёл').toBeGreaterThan(
    0.0008,
  )

  const secondFrame = await readFrame(page, canvas)
  expect(secondFrame.distinctColors, 'второй кадр выродился').toBeGreaterThan(250)
  expect(secondFrame.brightShare, 'во втором кадре пропала геометрия').toBeGreaterThan(0.12)
})
