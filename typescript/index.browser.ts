// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Browser-flavoured entry point — re-exports the universal API.
// Bundlers picking up this file (via `exports."browser"` in package.json)
// get a clear hint that DOM is the intended environment.

export * from './index.js';
