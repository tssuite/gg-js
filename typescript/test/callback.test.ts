// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, test } from 'vitest';
import { runCallbackExample } from '../examples/callback.js';
import './setup.js';

describe('callback example', () => {
  test('JS callback is invoked by Dart for each item', async () => {
    const out = await runCallbackExample();
    expect(out).toEqual(['FOO', 'BAR', 'BAZ']);
  });
});
