// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, test } from 'vitest';
import { runBytesExample } from '../examples/bytes.js';
import './setup.js';

describe('bytes example', () => {
  test('returns the byte count for a populated buffer', async () => {
    const out = await runBytesExample(new Uint8Array([1, 2, 3, 4, 5]));
    expect(out).toEqual({ byteCount: 5 });
  });

  test('returns 0 for an empty buffer', async () => {
    const out = await runBytesExample(new Uint8Array(0));
    expect(out.byteCount).toBe(0);
  });
});
