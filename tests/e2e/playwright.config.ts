import { defineConfig, devices } from '@playwright/test';

/**
 * E2E contra la app local (API :3000 + web :5173 + Supabase local). Usa el Chrome instalado
 * (`channel: 'chrome'`) para no descargar navegadores. En CI: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    // La web detecta el idioma del navegador: las pruebas se escriben en español.
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    channel: process.env.CI ? undefined : 'chrome',
    // Los botones y cartas flotan sin parar: Playwright nunca los ve «estables» para hacer clic.
    // Con movimiento reducido la app los deja quietos (y así también se prueba esa preferencia).
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke/ },
  ],
  webServer: [
    { command: 'npm run dev:api', url: 'http://localhost:3000/api/health/live', reuseExistingServer: true, timeout: 120_000, cwd: '../..' },
    { command: 'npm run dev:web', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000, cwd: '../..' },
  ],
});
