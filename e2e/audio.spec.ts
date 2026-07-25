import { expect, test, type Page } from '@playwright/test'

/**
 * Звук — в настоящем браузере.
 *
 * Проверяется не «как звучит» (этого автоматически не проверить), а три
 * вещи, каждая из которых уже ломала звук в соседнем проекте:
 *
 * 1. **Файлы действительно отдаются.** Там звуковой слой написали,
 *    а файлы перенести забыли: игра собиралась, тесты проходили,
 *    звука не было вовсе. Здесь каждый путь из каталога запрашивается
 *    у сервера по-настоящему.
 * 2. **До первого действия человека в консоли пусто.** Браузер запрещает
 *    автозапуск, и это норма, а не ошибка: ни одного исключения,
 *    ни одного предупреждения из-за запрета быть не должно.
 * 3. **Настройки переживают перезагрузку.** Человек, убравший звук,
 *    сделал это не на одну вкладку.
 */

/** Все пути, которые обещает каталог. Список тот же, что в catalog.ts. */
const MUSIC = ['day', 'lounge', 'lesson', 'session', 'night', 'epilogue']
const AMBIENCE = [
  'corridor',
  'corridor-busy',
  'lecture',
  'lecture-class',
  'toilet',
  'elevator-hall',
]
const SFX = [
  'step-1',
  'step-2',
  'step-3',
  'coffee',
  'flush',
  'tap',
  'elevator-doors',
  'elevator-ding',
  'chair',
  'page',
  'paper',
  'pen',
]
const VOICE = ['marey', 'alieva'].flatMap((bank) =>
  ['statement', 'question', 'cheerful', 'displeased'].map((mood) => `${bank}-${mood}`),
)

const ALL_FILES = [
  ...MUSIC.map((id) => `/audio/music/${id}.mp3`),
  ...AMBIENCE.map((id) => `/audio/ambience/${id}.mp3`),
  ...SFX.map((id) => `/audio/sfx/${id}.mp3`),
  ...VOICE.map((id) => `/audio/voice/${id}.mp3`),
]

/** Ошибки консоли и необработанные исключения за время жизни страницы. */
function watchConsole(page: Page): string[] {
  const problems: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`консоль: ${message.text()}`)
  })
  page.on('pageerror', (error) => problems.push(`исключение: ${error.message}`))
  return problems
}

async function openGame(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.locator('.hud__audio')).toBeVisible()
}

test('все обещанные звуковые файлы отдаются сервером', async ({ page }) => {
  await openGame(page)

  const results = await page.evaluate(async (paths: string[]) => {
    const report: { path: string; status: number; bytes: number }[] = []
    for (const path of paths) {
      try {
        const response = await fetch(path)
        const blob = await response.blob()
        report.push({ path, status: response.status, bytes: blob.size })
      } catch {
        report.push({ path, status: 0, bytes: 0 })
      }
    }
    return report
  }, ALL_FILES)

  expect(results).toHaveLength(ALL_FILES.length)
  for (const file of results) {
    expect(file.status, file.path).toBe(200)
    expect(file.bytes, file.path).toBeGreaterThan(1000)
  }
})

test('до первого действия человека звук молчит и не жалуется', async ({ page }) => {
  const problems = watchConsole(page)
  await openGame(page)
  // Дать звуковому слою покрутиться вхолостую: он опрашивает мир десять
  // раз в секунду и без разрешения не должен ничего сказать в консоль.
  await page.waitForTimeout(1500)
  expect(problems).toEqual([])
})

test('после клика звук получает разрешение и играет', async ({ page }) => {
  const problems = watchConsole(page)

  // Что игра на самом деле запросила у сервера. Список написанного мало
  // что доказывает: доказывает — трафик.
  const asked: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/audio/')) asked.push(path)
  })

  await openGame(page)
  expect(asked, 'до действия человека звук не качается').toEqual([])

  // Настоящий клик мыши — это и есть то действие, после которого браузер
  // разрешает звук. Кликаем по сцене, а не по кнопке: так делает игрок.
  await page.locator('canvas').click({ position: { x: 700, y: 500 } })
  await page.waitForTimeout(2500)

  expect(asked.some((path) => path.startsWith('/audio/music/'))).toBe(true)
  expect(asked.some((path) => path.startsWith('/audio/ambience/'))).toBe(true)
  expect(asked.some((path) => path.startsWith('/audio/sfx/'))).toBe(true)
  expect(asked.some((path) => path.startsWith('/audio/voice/'))).toBe(true)

  await page.locator('.audio__toggle').click()
  await expect(page.locator('.audio__panel')).toBeVisible()
  // Подсказка про разрешение исчезает ровно тогда, когда разрешение есть.
  await expect(page.locator('.audio__panel .hud__hint')).toHaveCount(0)
  await page.screenshot({ path: 'screenshots/40-audio-panel.png' })
  expect(problems).toEqual([])
})

test('панель звука не перекрывает соседние панели', async ({ page }) => {
  await openGame(page)
  await page.locator('.audio__toggle').click()

  const audio = await page.locator('.audio__panel').boundingBox()
  expect(audio).not.toBeNull()
  if (audio === null) return

  for (const selector of ['.hud__schedule', '.hud__needs', '.hud__skills', '.hud__time']) {
    const box = await page.locator(selector).boundingBox()
    expect(box, selector).not.toBeNull()
    if (box === null) continue
    const overlaps =
      audio.x < box.x + box.width &&
      box.x < audio.x + audio.width &&
      audio.y < box.y + box.height &&
      box.y < audio.y + audio.height
    expect(overlaps, `${selector} перекрыта панелью звука`).toBe(false)
  }
})

/**
 * Точки в кадре, попадающие в обстановку А-204. Те же, что в visual.spec
 * и sitting.spec: парта и стул — трёхмерные предметы, а не элементы
 * страницы, поэтому кликать приходится по пикселю, а точек берётся
 * несколько.
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

test('переход в аудиторию меняет атмосферу', async ({ page }) => {
  const asked: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/audio/ambience/')) asked.push(path)
  })

  await openGame(page)
  await page.waitForTimeout(6000)
  await expect(page.locator('.npc-label')).toHaveCount(6)

  const box = await page.locator('canvas').boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  // Первый же клик даёт разрешение на звук, а в коридоре игрок стоит
  // с самого начала: слой коридора обязан появиться раньше остальных.
  await page.locator('.speed-buttons button').nth(3).click()
  await page.waitForTimeout(1500)
  expect(asked).toContain('/audio/ambience/corridor.mp3')

  // Уходим в аудиторию и садимся за парту.
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

  await expect(page.locator('.hud__where')).toHaveText('Сейчас: А-204', { timeout: 90_000 })
  await page.waitForTimeout(1500)

  // Помещение сменилось — сменился и воздух в нём.
  expect(asked.some((path) => path.endsWith('/lecture.mp3'))).toBe(true)
})

test('настройки звука переживают перезагрузку', async ({ page }) => {
  await openGame(page)
  await page.locator('.audio__toggle').click()

  // Выключатель и один ползунок: в хранилище должно уехать и то, и другое.
  await page.locator('.audio__switch').click()
  await expect(page.locator('.audio__switch')).toHaveText('Выключен')

  const stored = await page.evaluate(() => localStorage.getItem('sims-fgn/audio/v1'))
  expect(stored).not.toBeNull()
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ enabled: false })

  await page.reload()
  await expect(page.locator('.audio__toggle')).toHaveAttribute('data-off', 'true')
  await page.locator('.audio__toggle').click()
  await expect(page.locator('.audio__switch')).toHaveText('Выключен')
})
