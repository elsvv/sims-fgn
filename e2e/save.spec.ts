import { expect, test, type Page } from '@playwright/test'

/**
 * Сохранение и загрузка глазами браузера.
 *
 * Круг «снять состояние — вернуть состояние» уже проверен модульными
 * тестами. Здесь проверяется то, чего они не видят: что кнопка доходит
 * до мира, что localStorage действительно хранит слот, что список слотов
 * показывает дату и игровой день и что «начать заново» отматывает игру
 * к первому понедельнику.
 */

/** Сколько ждать, пока three.js соберёт сцену: без кадров игровой цикл стоит. */
const SCENE_READY_MS = 6000

async function openMenu(page: Page): Promise<void> {
  await page.locator('.hud__gamemenu').click()
  await expect(page.locator('.savemenu')).toBeVisible()
}

/** Ждёт, пока часы уйдут вперёд: игровое время должно идти. */
async function waitForClockChange(page: Page, from: string): Promise<void> {
  await expect
    .poll(async () => page.locator('.hud__clock').textContent(), { timeout: 30_000 })
    .not.toBe(from)
}

/**
 * Показания часов после того, как они остановились.
 *
 * Панель перечитывает мир десять раз в секунду, поэтому в первый миг
 * после остановки времени на экране ещё висит значение, снятое до неё, —
 * и оно на игровую минуту младше того, на котором мир замер. Прочитать
 * его и потребовать, чтобы часы остались на нём, значит потребовать
 * от них шага назад. Отсюда ожидание двух одинаковых показаний подряд:
 * это и есть «часы встали».
 */
async function stoppedClock(page: Page): Promise<string> {
  const clock = page.locator('.hud__clock')
  let previous = ''
  for (let attempt = 0; attempt < 30; attempt++) {
    await page.waitForTimeout(150)
    const current = (await clock.textContent()) ?? ''
    if (current !== '' && current === previous) return current
    previous = current
  }
  throw new Error('часы не остановились, хотя меню открыто')
}

test('игра сохраняется в слот, загружается обратно и начинается заново', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(SCENE_READY_MS)

  const clock = page.locator('.hud__clock')
  const day = page.locator('.hud__day')
  await expect(day).toHaveText('Неделя 1, понедельник')

  // --- Список слотов ---
  await openMenu(page)
  const slots = page.locator('.saveslot')
  await expect(slots).toHaveCount(4)
  await expect(slots.first().locator('.saveslot__label')).toHaveText('Автосохранение')
  await expect(slots.nth(1).locator('.saveslot__label')).toHaveText('Слот 1')
  await expect(slots.nth(1).locator('.saveslot__when')).toHaveText('Пусто')

  // В пустом слоте загружать нечего.
  await expect(slots.nth(1).getByText('Загрузить')).toBeDisabled()

  // Пока меню открыто, время стоит: список слотов читают не торопясь.
  const paused = await stoppedClock(page)
  await page.waitForTimeout(2000)
  await expect(clock).toHaveText(paused)

  // --- Сохранение ---
  await slots.nth(1).getByText('Сохранить').click()
  await expect(page.locator('.savemenu__notice')).toContainText('Игра сохранена')

  const savedAt = await clock.textContent()
  expect(savedAt).toMatch(/^\d{2}:\d{2}$/)

  // Слот подписан игровым днём и настоящей датой.
  const when = slots.nth(1).locator('.saveslot__when')
  await expect(when).toContainText('Неделя 1, понедельник')
  await expect(when).toContainText(String(savedAt))
  await expect(when).toContainText('сохранено')
  await expect(slots.nth(1).getByText('Загрузить')).toBeEnabled()

  // Сохранение действительно лежит в хранилище браузера.
  const stored = await page.evaluate(() => window.localStorage.getItem('sims-fgn/save/1'))
  expect(stored, 'слот не попал в localStorage').not.toBeNull()
  expect(stored ?? '').toContain('"version"')

  await page.getByText('Вернуться в игру').click()
  await expect(page.locator('.savemenu')).toHaveCount(0)

  // --- Загрузка ---
  await waitForClockChange(page, savedAt ?? '')

  await openMenu(page)
  await expect(slots.nth(1).locator('.saveslot__when')).toContainText(String(savedAt))
  await slots.nth(1).getByText('Загрузить').click()

  // Меню закрылось само, и часы вернулись к сохранённой минуте.
  await expect(page.locator('.savemenu')).toHaveCount(0)
  await expect(clock).toHaveText(String(savedAt))

  // --- Начать заново ---
  const afterLoad = await clock.textContent()
  await waitForClockChange(page, afterLoad ?? '')

  await openMenu(page)
  await page.getByText('Начать заново').click()
  await expect(page.locator('.savemenu__confirm-text')).toContainText('Текущий модуль пропадёт')

  // Отказ ничего не делает.
  await page.getByText('Нет, вернуться').click()
  await expect(page.locator('.savemenu__confirm')).toHaveCount(0)

  await page.getByText('Начать заново').click()
  await page.getByText('Да, начать заново').click()
  await expect(page.locator('.savemenu')).toHaveCount(0)

  // Новая партия начинается с первого понедельника.
  await expect(day).toHaveText('Неделя 1, понедельник')
  await expect
    .poll(async () => clock.textContent(), { timeout: 20_000 })
    .toMatch(/^07:0\d$/)

  // Сохранение при этом никуда не делось: начать заново — не значит стереть.
  await openMenu(page)
  await expect(slots.nth(1).locator('.saveslot__when')).toContainText('Неделя 1')
  await expect(slots.nth(1).getByText('Загрузить')).toBeEnabled()

  // --- Стирание слота ---
  await slots.nth(1).getByText('Стереть').click()
  await expect(page.locator('.savemenu__notice')).toContainText('Слот 1 стёрт')
  await expect(slots.nth(1).locator('.saveslot__when')).toHaveText('Пусто')
  expect(await page.evaluate(() => window.localStorage.getItem('sims-fgn/save/1'))).toBeNull()
})
