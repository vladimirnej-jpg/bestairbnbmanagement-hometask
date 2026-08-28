import { loadEnvConfig } from '@next/env';
import { defineConfig, devices } from '@playwright/test';

loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://127.0.0.1:3000/api/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3000',
        CORS_ORIGIN: 'http://127.0.0.1:3000',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://bestairbnb:bestairbnb@127.0.0.1:5432/bestairbnb?schema=public',
        DIRECT_URL:
          process.env.DIRECT_URL ??
          process.env.DATABASE_URL ??
          'postgresql://bestairbnb:bestairbnb@127.0.0.1:5432/bestairbnb?schema=public',
        JWT_SECRET: process.env.JWT_SECRET ?? 'local-playwright-secret-that-is-long-enough',
        PROVIDER_MODE: 'fake',
        INNGEST_DEV: '1',
      },
    },
    {
      command: 'pnpm inngest:dev',
      url: 'http://127.0.0.1:8288',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        INNGEST_DEV: '1',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
