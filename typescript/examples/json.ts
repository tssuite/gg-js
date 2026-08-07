// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Example 3 — Typed object exchange across the boundary.
//
// We pass a plain JS object into Dart, and get a plain JS object back —
// no JSON.stringify/parse involved. On the Dart side this maps to
// `JSObject` extension types (see `lib/src/main.dart`).

import { init, type EnrichedPerson, type Person } from '../index.js';

export async function runJsonExample(person: Person): Promise<EnrichedPerson> {
  const dart = await init();
  return dart.enrichPerson(person);
}
