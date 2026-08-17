#!/usr/bin/env node
// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The published `ggwsm` executable.
//
// It exists as a hand-written file rather than a build artifact so the
// shebang survives bundling: `npx ggwsm` runs this, which loads the bundled
// CLI next to it.

import './cli.js';
