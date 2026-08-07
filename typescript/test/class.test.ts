// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, test } from 'vitest';
import { init } from '../index.js';
import './setup.js';

describe('class example', () => {
  test('Counter increments synchronously and async', async () => {
    const dart = await init();
    const c = dart.createCounter(10);
    expect(c.value).toBe(10);
    expect(c.increment()).toBe(11);
    expect(c.increment(4)).toBe(15);
    const v = await c.incrementAsync(5, 5);
    expect(v).toBe(20);
    expect(c.value).toBe(20);
  });
});
