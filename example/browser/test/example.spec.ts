// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// End-to-end test for the browser demo: loads the page in a real
// Chromium, waits for the Dart/Wasm bridge to initialize, and checks
// that every example section renders its expected output.

import { expect, test } from '@playwright/test';

test.describe('browser demo page', () => {
  test('renders title and heading', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('gg_bridge_dart_typescript — browser demo');
    await expect(page.locator('h1')).toHaveText('gg_bridge_dart_typescript');
  });

  test('renders all five example outputs', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));

    await page.goto('/');

    await expect(page.locator('#out-function')).toHaveText(
      "add(2, 3) = 5; greet('world') = Hello, world!",
    );

    await expect(page.locator('#out-class')).toHaveText(
      'Counter ended at 20 (live value: 20)',
    );

    const json = page.locator('#out-json');
    await expect(json).toContainText('"name": "Alice"');
    await expect(json).toContainText('"age": 30');
    await expect(json).toContainText('"isAdult": true');

    await expect(page.locator('#out-callback')).toHaveText('FOO, BAR, BAZ');

    await expect(page.locator('#out-bytes')).toContainText('"byteCount": 5');

    expect(pageErrors).toEqual([]);
  });

  test('does not show the unsupported-browser banner', async ({ page }) => {
    await page.goto('/');

    // Wait until the bridge has produced output, then check no support
    // banner was prepended.
    await expect(page.locator('#out-function')).not.toHaveText('…');
    await expect(page.getByText('Browser not supported')).toHaveCount(0);
  });
});
