// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Coverage probes for `resolveWasmUrl`: feed the loader an explicit URL
// once as a string and once as a `URL` instance so both branches of the
// resolver are exercised.

import { afterEach, describe, expect, test } from 'vitest';
import { _resetForTests, init } from '../index.js';

const wasmUrl = new URL(
  '../generated/bridge-wasm.wasm',
  import.meta.url,
);

describe('runtime: explicit wasmUrl', () => {
  afterEach(() => {
    _resetForTests();
  });

  test('accepts a URL instance', async () => {
    const dart = await init({ wasmUrl });
    expect(dart.add(2, 3)).toBe(5);
  });

  test('accepts a string', async () => {
    const dart = await init({ wasmUrl: wasmUrl.href });
    expect(dart.add(2, 3)).toBe(5);
  });
});
