// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, test } from 'vitest';
import { runFunctionExample } from '../examples/function.js';
import { init } from '../index.js';
import './setup.js';

describe('function example', () => {
  test('add and greet', async () => {
    const dart = await init();
    expect(dart.add(2, 3)).toBe(5);
    expect(dart.greet('world')).toBe('Hello, world!');
  });

  test('runFunctionExample composes a string', async () => {
    const out = await runFunctionExample();
    expect(out).toContain('5');
    expect(out).toContain('Hello, world!');
  });
});
