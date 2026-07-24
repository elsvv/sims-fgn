import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Браузерные тесты гоняет playwright, vitest не должен их даже видеть.
    exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
  },
})
