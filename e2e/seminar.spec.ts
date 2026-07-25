import { expect, test, type Page } from '@playwright/test'

/**
 * Главная сцена игры целиком, глазами браузера: студент садится в А-204,
 * дожидается звонка, поднимает руку — и Алиева отвечает ему своими словами.
 *
 * Проверять это в браузере обязательно. Симуляция уже покрыта модульными
 * тестами, но между ней и игроком лежат три вещи, которых модульный тест
 * не видит: панель появляется вовремя, кнопка доходит до мира, а ответ
 * преподавателя действительно оказывается на экране.
 */

/**
 * Точки в кадре, попадающие на пол аудитории А-204, — доли ширины и высоты
 * канваса. Все три проверены поодиночке: каждая уводит персонажа со стартовой
 * клетки коридора в аудиторию. Их несколько на случай, если сцена чуть
 * сместится: промах по полу ничего не ломает, персонаж просто остаётся
 * на месте, и берётся следующая точка.
 */
const A204_SPOTS: readonly [number, number][] = [
  [0.56, 0.3],
  [0.58, 0.27],
  [0.62, 0.24],
]

/**
 * Уводит персонажа в аудиторию.
 *
 * Кликать приходится по пикселю: пол — это трёхмерная плоскость, а не
 * элемент страницы. Точек несколько, потому что попасть можно в парту,
 * а не в пол, — тогда открывается меню предмета, его закрывают и пробуют
 * следующую точку.
 */
async function walkIntoClassroom(page: Page): Promise<void> {
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  expect(box, 'у канваса нет размеров').not.toBeNull()
  if (!box) return

  const where = page.locator('.hud__where')

  for (const [fx, fy] of A204_SPOTS) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)

    const menu = page.locator('.hud__menu')
    if ((await menu.count()) > 0) {
      await menu.getByText('Отмена', { exact: true }).click()
      continue
    }

    try {
      await expect.poll(async () => where.textContent(), { timeout: 12_000 }).toBe(
        'Сейчас: А-204',
      )
      return
    } catch {
      // Не дошёл — пробуем следующую точку.
    }
  }

  throw new Error('не удалось довести персонажа до аудитории А-204')
}

test('студент выступает на семинаре и слышит ответ преподавателя', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(6000)

  // Тройная скорость: до первой пары два игровых часа.
  await page.locator('.speed-buttons button').nth(3).click()

  await walkIntoClassroom(page)

  // До звонка панели выступления нет: семинар — это событие расписания,
  // а не кнопка, которая висит всегда.
  const seminar = page.locator('.hud__seminar')
  await expect(seminar).toHaveCount(0)

  // Ждём девяти утра. Пара сама себя объявит, а посещаемость проставится
  // по тому, что персонаж всё это время просидел в аудитории.
  await expect(seminar).toHaveCount(1, { timeout: 90_000 })
  await expect(page.locator('.lesson__mark--present')).toBeVisible()

  await expect(seminar.locator('.hud__panel-title')).toHaveText('Семинар — Греческий, Алиева')
  await expect(seminar.getByText('Поднять руку?')).toBeVisible()

  // Первокурснику с нулевыми навыками открыты только безусловные способы:
  // спорить и ссылаться на канон ему пока нечем.
  const options = seminar.locator('.seminar__option')
  await expect(options).toHaveCount(2)
  await expect(options.first().locator('.seminar__option-label')).toHaveText(
    'Осторожно пересказать прочитанное',
  )
  await expect(options.first().locator('.seminar__option-hint')).not.toBeEmpty()
  await expect(seminar.getByText('Поспорить с преподавателем')).toHaveCount(0)

  // Панель выступления не наезжает на соседей: она живёт внизу по центру,
  // между нуждами слева и навыками справа.
  const boxes = await Promise.all(
    ['.hud__seminar', '.hud__needs', '.hud__skills', '.hud__schedule'].map((selector) =>
      page.locator(selector).boundingBox(),
    ),
  )
  const panel = boxes[0]
  expect(panel).not.toBeNull()
  for (const other of boxes.slice(1)) {
    if (!panel || !other) continue
    const overlaps =
      panel.x < other.x + other.width &&
      other.x < panel.x + panel.width &&
      panel.y < other.y + other.height &&
      other.y < panel.y + panel.height
    expect(overlaps, 'панель семинара наезжает на соседнюю').toBe(false)
  }

  await page.screenshot({ path: 'screenshots/05-seminar.png', fullPage: true })

  // --- Выступление ---
  await options.first().click()

  // Ответ преподавателя — то, ради чего всё это. Реплика приходит из его
  // собственного набора, а не из общей заготовки.
  const reply = seminar.locator('.dialogue__reply')
  await expect(reply).toBeVisible()
  await expect(reply).not.toBeEmpty()
  await expect(seminar.locator('.dialogue__speaker')).toHaveText('Алиева Ольга Валерьевна')
  await expect(seminar.locator('.seminar__grade')).toHaveText(/^\d{1,2}$/)
  await expect(options).toHaveCount(0)

  await page.screenshot({ path: 'screenshots/06-seminar-reply.png', fullPage: true })

  // Выступление оставило след: красноречие сдвинулось с нуля, а в списке
  // модификаторов настроения появилась строчка про семинар.
  const skills = page.locator('.hud__skills')
  const eloquence = skills.locator('.skill', { hasText: 'Красноречие' })
  await expect(eloquence.locator('.skill__value')).not.toHaveText('0,0')
  await expect(skills.locator('.moodlet__label')).toContainText(/семинаре/)

  // --- После выступления ---
  await seminar.getByText('Сесть на место', { exact: true }).click()
  await expect(reply).toHaveCount(0)
  await expect(seminar.locator('.seminar__closed')).toHaveText('Вы уже выступали')

  expect(
    consoleErrors.filter((text) => !text.includes('Download the React DevTools')),
    'браузер ругался в консоль',
  ).toEqual([])
})
