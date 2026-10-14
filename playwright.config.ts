import { defineConfig, devices } from '@playwright/test';
import { E2E_CONTENT_REPO, E2E_DATABASE_URL, SEED } from './tests/e2e/seed';

const node = JSON.stringify(process.execPath);
const DEV_PORT = 4400;
const PROD_PORT = 4401;

// Runs against a git repository with the e2e fixture content (published by the setup project),
// the course_e2e database and the Mailpit test mailbox.
const env = {
  CONTENT_DIR: '',
  CONTENT_REPO_URL: E2E_CONTENT_REPO,
  CONTENT_BRANCH: 'main',
  DATABASE_URL: E2E_DATABASE_URL,
};

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${DEV_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], storageState: SEED.learner.state },
      dependencies: ['setup'],
      testIgnore: /publishing\.spec/,
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 13'], storageState: SEED.learner.state },
      dependencies: ['setup'],
      // Account flows, publishing and the production build are covered on desktop.
      testIgnore: /(accounts|production|publishing)\.spec/,
    },
    {
      // Changes the shared course content, so it runs after everything else.
      name: 'publishing',
      testMatch: /publishing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: SEED.admin.state },
      dependencies: ['desktop-chromium', 'mobile-webkit'],
    },
  ],
  webServer: [
    {
      command: `${node} node_modules/astro/bin/astro.mjs dev --port ${DEV_PORT} --ignore-lock`,
      url: `http://localhost:${DEV_PORT}/prihlaseni`,
      env: { ...env, APP_BASE_URL: `http://localhost:${DEV_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // Production build: checks access control as deployed.
      command: `${node} node_modules/astro/bin/astro.mjs build && ${node} dist/server/entry.mjs`,
      port: PROD_PORT,
      env: { ...env, APP_BASE_URL: `http://127.0.0.1:${PROD_PORT}`, HOST: '127.0.0.1', PORT: String(PROD_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
