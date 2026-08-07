// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'typescript/index.ts'),
        'index.browser': resolve(__dirname, 'typescript/index.browser.ts'),
        'index.node': resolve(__dirname, 'typescript/index.node.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['node:fs/promises', 'node:url', 'node:path'],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  assetsInclude: ['**/*.wasm'],
});
