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
        cli: resolve(__dirname, 'typescript/cli.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      // Every Node builtin stays external. A hand-kept list is a trap:
      // a missing entry does not fail the build, it produces a namespace
      // without the function in it, and the call fails at runtime — which
      // is how `node:readline` once broke every interactive prompt while
      // the unit tests, which run the source rather than the bundle,
      // stayed green.
      external: [/^node:/],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  // Library mode inlines assets, so the 1.2 MB `.wasm` ends up as a base64
  // data URI inside the chunk that `runtime.ts` imports dynamically. That
  // is deliberate: it makes `init()` work in Node, in a browser and under
  // every bundler without anybody having to resolve an asset path. The
  // chunk is only fetched when `init()` runs, so merely importing the
  // package stays cheap.
  //
  // `dist/bridge-wasm.wasm` is copied next to it by the build script and
  // exported as `@tssuite/gg-js/wasm` for consumers who would rather load
  // the module themselves and pass `wasmUrl`.
  assetsInclude: ['**/*.wasm'],
});
