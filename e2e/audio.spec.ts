import { expect, test, type Page } from '@playwright/test'
import type * as PhraseModule from '../src/render/audio/phrase'
import type * as SimlishModule from '../src/render/audio/simlish'
import type * as VoicesModule from '../src/render/audio/voices'

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
/*
 * Голосов в этом списке нет нарочно: симлиш синтезируется на месте
 * и файлами не лежит. Что он при этом звучит, проверяет отдельный
 * тест ниже — рендером в настоящем браузере.
 */
const ALL_FILES = [
  ...MUSIC.map((id) => `/audio/music/${id}.mp3`),
  ...AMBIENCE.map((id) => `/audio/ambience/${id}.mp3`),
  ...SFX.map((id) => `/audio/sfx/${id}.mp3`),
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

/**
 * Голоса — самая уязвимая часть звука, и уязвима она иначе, чем файлы.
 *
 * Симлиш не лежит записями: он синтезируется на Web Audio, и весь
 * синтез обёрнут в try/catch — сцена не имеет права упасть из-за звука.
 * Отсюда ровно та же беда, что в соседнем проекте, только с другого
 * конца: неверный вызов Web Audio не уронит игру и не напишет в консоль,
 * он просто вернёт тишину. Ни один модульный тест этого не поймает —
 * Web Audio в них нет.
 *
 * Поэтому здесь настоящий рендер в настоящем браузере, и проверяется
 * то, ради чего всё писалось: звук не пустой, шестеро звучат по-разному,
 * а вопрос отличается от утверждения.
 */
test('шесть голосов синтезируются и звучат по-разному', async ({ page }) => {
  const problems = watchConsole(page)
  await openGame(page)

  const measured = await page.evaluate(async () => {
    // Путь собирается из куска: иначе его пытается разрешить tsc,
    // которому в браузерный адрес ходить незачем. Типы при этом
    // настоящие — они приехали обычным import type наверху файла.
    const load = (name: string): Promise<unknown> => import(`/src/render/audio/${name}.ts`)
    const voices = (await load('voices')) as typeof VoicesModule
    const phrase = (await load('phrase')) as typeof PhraseModule
    const simlish = (await load('simlish')) as typeof SimlishModule

    const out: { id: string; emotion: string; peak: number; rms: number; seconds: number }[] = []
    for (const id of voices.VOICE_IDS) {
      for (const emotion of voices.VOICE_EMOTIONS) {
        const plan = phrase.planForLine(voices.VOICES[id], emotion, 'Итак, начнём разговор.', id)
        const buffer = await simlish.renderPhrase(plan, 44100)
        if (buffer === null) {
          out.push({ id, emotion, peak: 0, rms: 0, seconds: 0 })
          continue
        }
        const data = buffer.getChannelData(0)
        let peak = 0
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const value = Math.abs(data[i] ?? 0)
          if (value > peak) peak = value
          sum += (data[i] ?? 0) ** 2
        }
        out.push({
          id,
          emotion,
          peak,
          rms: Math.sqrt(sum / data.length),
          seconds: buffer.duration,
        })
      }
    }
    return out
  })

  expect(measured).toHaveLength(24)
  for (const row of measured) {
    const where = `${row.id}/${row.emotion}`
    // Тишина — это и есть та поломка, ради которой тест написан.
    expect(row.peak, where).toBeGreaterThan(0.2)
    expect(row.rms, where).toBeGreaterThan(0.02)
    // И не оглушительно: ограничитель стоит на 0.9.
    expect(row.peak, where).toBeLessThanOrEqual(0.9)
    expect(row.seconds, where).toBeGreaterThan(0.3)
    expect(row.seconds, where).toBeLessThan(4)
  }

  // Недовольство тише радости у каждого: половина эмоции — это громкость,
  // и ограничитель не имеет права её срезать.
  for (const id of new Set(measured.map((row) => row.id))) {
    const glad = measured.find((row) => row.id === id && row.emotion === 'cheerful')
    const sour = measured.find((row) => row.id === id && row.emotion === 'displeased')
    expect(sour!.peak, `${id}: недовольство громче радости`).toBeLessThan(glad!.peak)
  }

  expect(problems).toEqual([])
})

test('длинная реплика бормочется дольше короткой, но не впятеро', async ({ page }) => {
  await openGame(page)

  const measured = await page.evaluate(async () => {
    const load = (name: string): Promise<unknown> => import(`/src/render/audio/${name}.ts`)
    const voices = (await load('voices')) as typeof VoicesModule
    const phrase = (await load('phrase')) as typeof PhraseModule
    const simlish = (await load('simlish')) as typeof SimlishModule

    const render = async (text: string) => {
      const plan = phrase.planForLine(voices.VOICES.marey, 'statement', text)
      const buffer = await simlish.renderPhrase(plan, 44100)
      return { seconds: plan.seconds, rendered: buffer?.duration ?? 0 }
    }
    return {
      short: await render('Садитесь.'),
      long: await render(
        'Итак. Сегодня три вещи. Первое — жанр, второе — метод, третье — вы и ваш текст.',
      ),
    }
  })

  expect(measured.short.seconds).toBeGreaterThan(0)
  expect(measured.long.seconds).toBeGreaterThan(measured.short.seconds)
  // Отношение длин ограничено сверху: иначе короткая фраза тянулась бы
  // ровно столько же, сколько абзац, или наоборот.
  expect(measured.long.seconds / measured.short.seconds).toBeLessThan(6)
  expect(measured.long.rendered).toBeLessThan(4)
})
