import { expect, test, type Page } from '@playwright/test'

/**
 * Люди на этаже нарисованы моделями — и остаются на этаже, даже когда
 * моделей нет.
 *
 * Проверка нужна именно в браузере. Разбор .glb, пересадка частей,
 * привязка к скелету и перекраска материалов происходят в WebGL-рантайме,
 * которого в юнит-тестах нет: там проверены правила, а не то, что файлы
 * доезжают и складываются в человека.
 *
 * Второй тест важнее первого. Модели персонажей — четыре мегабайта,
 * которые едут по сети, и запасной путь на капсульного человечка
 * существует ровно для случая «не доехали». Запасной путь, который никто
 * не проверял, — это не запасной путь.
 */

/** Сколько на этаже подписанных преподавателей. */
const FACULTY = 6

/** Сколько пикселей канваса заняты чем-то, кроме фона сцены. */
async function paintedShare(page: Page): Promise<number> {
  const canvas = page.locator('canvas')
  const png = await canvas.screenshot()
  return page.evaluate(async (source: string): Promise<number> => {
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
    let painted = 0
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)
      if (luma > 40) painted++
    }
    return painted / (data.length / 4)
  }, `data:image/png;base64,${png.toString('base64')}`)
}

test('модели людей грузятся и собираются без запасного пути', async ({ page }) => {
  const models: { url: string; status: number }[] = []
  page.on('response', (response) => {
    const url = new URL(response.url()).pathname
    if (url.startsWith('/models/characters/')) models.push({ url, status: response.status() })
  })

  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(8000)

  await expect(page.locator('.npc-label')).toHaveCount(FACULTY)

  // Файлы: тела, донорские части и общий файл анимаций. Все до одного
  // должны доехать целыми — иначе кто-то из шестерых собран наполовину.
  expect(models.length, 'ни одна модель человека не запрашивалась').toBeGreaterThan(0)
  for (const model of models) {
    expect(model.status, model.url).toBeLessThan(400)
  }
  const requested = new Set(models.map((model) => model.url))
  expect(requested, 'общий файл анимаций не запрашивался').toContain(
    '/models/characters/animations.glb',
  )
  expect(
    [...requested].filter((url) => url.endsWith('.glb')).length,
    'моделей людей запрошено меньше, чем нужно на шестерых и игрока',
  ).toBeGreaterThanOrEqual(6)

  // Запасной путь не сработал: ни одной жалобы на подмену геометрии.
  expect(
    consoleErrors.filter((text) => text.includes('не загрузилась')),
    'кто-то из людей нарисован капсулами вместо модели',
  ).toEqual([])

  await page.screenshot({ path: 'screenshots/30-characters.png', fullPage: true })
})

test('если модели не доехали, люди остаются на этаже', async ({ page }) => {
  // Обрываем ровно то, что может оборваться в жизни: файлы моделей людей.
  // Всё остальное — код игры, обстановка, интерфейс — доезжает как обычно.
  await page.route('**/models/characters/**', (route) => route.abort())

  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(8000)

  // Главное: игра не упала и людей на этаже по-прежнему шестеро.
  await expect(page.locator('.npc-label')).toHaveCount(FACULTY)
  await expect(page.locator('.hud__clock')).toHaveText(/^\d{2}:\d{2}$/)

  // И это не пустой экран с подписями: сцена нарисована.
  expect(
    await paintedShare(page),
    'сцена без моделей людей осталась чёрной',
  ).toBeGreaterThan(0.2)

  await page.screenshot({ path: 'screenshots/31-characters-fallback.png', fullPage: true })
})
