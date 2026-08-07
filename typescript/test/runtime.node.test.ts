// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Node-only coverage probe for `fetchWasm`'s non-file branch: serve the
// compiled `.wasm` from a local HTTP server so the loader takes the
// `fetch(url)` path instead of reading the file from disk.

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test } from 'vitest';
import { _resetForTests, init } from '../index.js';

const wasmPath = new URL('../generated/bridge-wasm.wasm', import.meta.url);

describe('runtime: http wasmUrl', () => {
  afterEach(() => {
    _resetForTests();
  });

  test('loads the wasm via fetch() for non-file URLs', async () => {
    const bytes = await readFile(wasmPath);
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/wasm' });
      res.end(bytes);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;

    try {
      const dart = await init({
        wasmUrl: `http://127.0.0.1:${port}/bridge-wasm.wasm`,
      });
      expect(dart.add(2, 3)).toBe(5);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
