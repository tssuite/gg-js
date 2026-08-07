// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Node-flavoured entry point — re-exports the universal API. The runtime
// auto-detects Node and reads the .wasm file from disk via `node:fs/promises`.

export * from './index.js';
