import { defineConfig, devices } from '@playwright/test'

/**
 * Порт. По умолчанию 5179, а не привычный 5173, и это не вкусовщина.
 *
 * Ниже стоит `reuseExistingServer`, а `npm run dev` берёт 5173 у всякого
 * проекта на vite. Если на 5173 висит чужой dev-сервер — а он там висит
 * у любого, кто держит открытым соседний проект, — vite со `strictPort`
 * не поднимется, playwright сочтёт чужой сервер своим и уведёт все восемь
 * проверок смотреть чужое приложение. Падают они при этом на «нет канваса»,
 * и по этому сообщению догадаться о подмене нельзя.
 *
 * Так и случилось при проверке этапа: восемь падений подряд, а на 5173
 * работал соседний проект. Отсюда две меры. Первая — порт по умолчанию
 * не тот, за который дерутся: 5179 никем не занимается по привычке.
 * Вторая — проект `сервер` ниже: он проверяет, что по адресу отвечает
 * именно эта игра, и падает с внятным текстом, а не с «нет канваса».
 *
 * Переназначить снаружи по-прежнему можно: `PORT=5180 npm run e2e`.
 */
const PORT = Number(process.env.PORT ?? 5179)
const BASE_URL = `http://localhost:${PORT}`

/**
 * Визуальная проверка: поднимаем dev-сервер vite и смотрим на игру глазами
 * настоящего браузера. Тесты лежат в e2e/, чтобы vitest их не подхватывал —
 * у него include ограничен src/**.
 *
 * Headless-браузер рисует WebGL программно через SwiftShader, поэтому нужны
 * явные флаги: без них three.js не получит контекст и сцена останется пустой.
 */
const chromium = {
  ...devices['Desktop Chrome'],
  baseURL: BASE_URL,
  viewport: { width: 1440, height: 900 },
  launchOptions: {
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  },
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  projects: [
    /*
     * Первым делом — что по адресу отвечает наша игра. Проверка идёт
     * отдельным проектом, а не глобальной настройкой, ровно по одной
     * причине: порядок. `webServer` гарантированно поднимается до любого
     * теста, а вот до `globalSetup` — как повезёт от версии.
     */
    { name: 'сервер', testMatch: /server\.setup\.ts/, use: chromium },
    { name: 'chromium', dependencies: ['сервер'], use: chromium },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
