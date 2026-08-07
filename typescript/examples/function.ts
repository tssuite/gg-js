// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Example 1 — calling a Dart function from JS.

import { init } from '../index.js';

export async function runFunctionExample(): Promise<string> {
  const dart = await init();
  const sum = dart.add(2, 3);
  const greeting = dart.greet('world');
  return `add(2, 3) = ${sum}; greet('world') = ${greeting}`;
}
