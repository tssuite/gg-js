// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The one thing worth checking in a real browser engine: that the engine
// this package requires — Wasm-GC plus the JS-string builtins — is
// actually there. happy-dom and jsdom cannot answer this honestly, which
// is why this file runs under Playwright/Chromium.

import { describe, expect, test } from 'vitest';
import { assertWasmGcSupported, checkWasmGcSupport } from '../compat.js';

describe('Wasm-GC support in a real browser', () => {
  test('is present in Chromium', () => {
    const support = checkWasmGcSupport();
    expect(support.supported).toBe(true);
    expect(support.reasons).toEqual([]);
  });

  test('assertWasmGcSupported passes', () => {
    expect(() => assertWasmGcSupported()).not.toThrow();
  });
});
