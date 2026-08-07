// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Project definitions live alongside the global config under
// `test.projects` so the two runtimes (Node + Playwright/Chromium) can
// each carry their own settings while sharing the coverage gate.

/// <reference types="vitest" />

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['typescript/test/**/*.test.ts'],
          exclude: [
            'typescript/test/**/*.browser.test.ts',
            'node_modules/**',
          ],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['typescript/test/**/*.test.ts'],
          exclude: ['typescript/test/**/*.node.test.ts', 'node_modules/**'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['typescript/**/*.ts'],
      exclude: [
        'typescript/index.ts',
        'typescript/index.browser.ts',
        'typescript/index.node.ts',
        'typescript/test/**',
        'typescript/generated/**',
        'typescript/examples/**',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
