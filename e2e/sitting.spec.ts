import { expect, test, type Page } from '@playwright/test'

/**
 * За партой сидят, а не стоят в ней.
 *
 * Проверять это можно только в браузере, и вот почему. Позы сидения
 * в наборе моделей нет вовсе, а клип из библиотеки анимаций того же автора
 * не подходит — скелеты разные (research/assets-characters.md, §7.3).
 * Поэтому поза считается прямо по костям загруженной модели: длины бедра
 * и голени меряются у настоящего скелета, углы решаются так, чтобы ступня
 * пришлась на пол. Ни скелета, ни костей в модульном тесте нет — там
 * проверена тригонометрия (render/character/posture.test.ts), а здесь то,
 * что она приложилась к живой модели и никого не вывернуло.
 */

/**
 * Точки в кадре, попадающие в обстановку А-204, — доли ширины и высоты
 * канваса. Кликать приходится по пикселю: и парта, и стул — это
 * трёхмерные предметы, а не элементы страницы. Точек несколько, потому
 * что промахнуться можно и в пол, и в стену; промах ничего не ломает.
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

/**
 * Действия, после которых персонаж оказывается на стуле, — в порядке
 * предпочтения.
 *
 * Годится любое: «Занять место» ведёт на клетку стула прямо, «Сесть
 * и слушать» у парты — на клетку подхода к ней, а стул стоит именно там.
 * Первое короче, поэтому проверка выбирает его.
 */
const SITTING_ACTIONS = ['Занять место', 'Сесть и слушать']

/** Усаживает персонажа в аудитории и возвращает выбранное действие. */
async function sitDown(page: Page): Promise<string> {
  const box = await page.locator('canvas').boundingBox()
  expect(box, 'у канваса нет размеров').not.toBeNull()
  if (!box) throw new Error('нет канваса')

  for (const [fx, fy] of A204_SPOTS) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    const menu = page.locator('.hud__menu')
    if ((await menu.count()) === 0) continue

    for (const label of SITTING_ACTIONS) {
      const item = menu.getByText(label, { exact: true })
      if ((await item.count()) > 0) {
        await item.click()
        return label
      }
    }
    await menu.getByText('Отмена', { exact: true }).click()
  }

  throw new Error('не удалось открыть меню предмета, на котором сидят')
}

test('на паре студент сидит на стуле, а не стоит в парте', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(8000)

  // Тройная скорость: иначе дорога через коридор и пара игровых минут
  // на стуле занимают полминуты реального времени.
  await page.locator('.speed-buttons button').nth(3).click()

  const action = await sitDown(page)
  const activity = page.locator('.hud__activity')
  await expect(activity).toHaveText(action)

  /*
   * Ждём, пока действие кончится, и это самая содержательная проверка
   * во всём тесте. Время действия идёт, только когда персонаж дошёл
   * (World.advanceInteraction). Значит, исчезнувшая подпись означает
   * ровно одно: он добрался до клетки со стулом и провёл на ней всё
   * положенное время — то есть сидел.
   */
  await expect(activity).toHaveCount(0, { timeout: 90_000 })
  await expect(page.locator('.hud__where')).toHaveText('Сейчас: А-204')

  // Сидеть он остаётся и после конца действия: сидение — это место,
  // а не занятие. Пауза даёт кадру устояться.
  await page.locator('.speed-buttons button').first().click()
  await page.waitForTimeout(1200)

  expect(consoleErrors, 'посадка на стул уронила что-то в консоль').toEqual([])
  await page.screenshot({ path: 'screenshots/32-sitting.png', fullPage: true })

  /*
   * Второй кадр — ради глаз. Панели интерфейса закрывают половину
   * аудитории, а на общем плане позу всё равно не разглядеть, поэтому
   * снимок делается без панелей и с приближенной камерой.
   */
  const box = await page.locator('canvas').boundingBox()
  if (box) {
    await page.addStyleTag({ content: '.hud > * { display: none !important }' })
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -900)
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'screenshots/33-sitting-closeup.png' })
  }
})
