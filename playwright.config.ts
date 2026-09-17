import { defineConfig } from '@playwright/test';

const production = process.env.FIELDNOTES_PRODUCTION === '1';
const baseURL = `http://127.0.0.1:${production ? 5307 : 4307}`;

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: production ? 'npm exec vite preview -- --host 127.0.0.1 --port 5307' : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI && !production,
  },
  workers: 1,
});
