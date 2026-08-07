// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Playwright config for the browser-demo end-to-end test. Run from the
// repo root with:
//
//   pnpm run test:example
//
// The wasm bundle must be built first (`pnpm run build:dart`); the dev
// server serves it from `typescript/generated/`.

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './test',
  // The wasm compile + first Vite transform can take a moment on cold
  // starts, so give web-first assertions a little more headroom.
  expect: { timeout: 15_000 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:5174' },
  webServer: {
    command: 'pnpm run example:browser',
    cwd: repoRoot,
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
});
