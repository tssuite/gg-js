// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, test } from 'vitest';
import { runJsonExample } from '../examples/json.js';
import './setup.js';

describe('json example', () => {
  test('marks adults as adults', async () => {
    const out = await runJsonExample({ name: 'Alice', age: 30 });
    expect(out).toEqual({ name: 'Alice', age: 30, isAdult: true });
  });

  test('marks minors as not adults', async () => {
    const out = await runJsonExample({ name: 'Bob', age: 12 });
    expect(out.isAdult).toBe(false);
  });
});
