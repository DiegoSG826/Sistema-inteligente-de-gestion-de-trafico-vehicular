import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

// Ephemeral test-only credentials; never used by the production launcher.
process.env.NODO_BROWSER_PASSWORD ||= randomBytes(32).toString('hex');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    launchOptions: { executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/browser-server.mjs',
    url: 'http://127.0.0.1:4173/healthz',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
