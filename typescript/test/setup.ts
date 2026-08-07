// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach } from 'vitest';
import { _resetForTests } from '../index.js';

afterEach(() => {
  _resetForTests();
});
