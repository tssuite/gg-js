// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Example 2 — Dart class with sync and async methods.

import { init } from '../index.js';

export async function runClassExample(): Promise<string> {
  const dart = await init();
  const counter = dart.createCounter(10);
  counter.increment();          // 11
  counter.increment(4);          // 15
  const final = await counter.incrementAsync(5, 5); // 20
  return `Counter ended at ${final} (live value: ${counter.value})`;
}
