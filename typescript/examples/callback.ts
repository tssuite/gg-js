// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Example 4 — Pass a JS callback into Dart and let Dart invoke it.

import { init } from '../index.js';

export async function runCallbackExample(): Promise<string[]> {
  const dart = await init();
  return dart.mapWithCallback(['foo', 'bar', 'baz'], (s) => s.toUpperCase());
}
