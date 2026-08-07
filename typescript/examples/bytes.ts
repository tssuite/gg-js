// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Example 5 — Byte array exchange across the boundary.
//
// We hand a JS `Uint8Array` to Dart, where it surfaces as a `Uint8List`
// view over the same bytes (no copy). Dart returns a `{ byteCount }` JSON
// object describing the buffer.

import { init, type ByteAnalysis } from '../index.js';

export async function runBytesExample(
  bytes: Uint8Array,
): Promise<ByteAnalysis> {
  const dart = await init();
  return dart.analyzeBytes(bytes);
}
