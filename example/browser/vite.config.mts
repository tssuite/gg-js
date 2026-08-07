// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@bridge': resolve(__dirname, '../../typescript'),
    },
  },
  server: {
    port: 5174,
    fs: {
      // allow Vite to read files from the repo root (parent of `example/`)
      allow: [resolve(__dirname, '../..')],
    },
  },
  optimizeDeps: {
    exclude: ['gg-bridge-dart-typescript'],
  },
});
