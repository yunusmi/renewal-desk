import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: fileURLToPath(new URL('./e2e/chrome-wrapper.sh', import.meta.url)) } : {}, baseURL: 'http://127.0.0.1:15173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: 'node e2e/server.cjs', url: 'http://127.0.0.1:15173/health/ready', reuseExistingServer: false, timeout: 60000 },
});
