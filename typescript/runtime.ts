// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { assertWasmGcSupported } from './compat.js';
import type { DartBridge } from './index.js';

/** Options for {@link loadBridge}. */
export interface RuntimeOptions {
  /**
   * URL of the `.wasm` file. Required when running in the browser unless
   * a bundler resolves it for you. In Node it resolves to a `file://` URL
   * next to this module.
   */
  wasmUrl?: string | URL;
}

declare global {
  // populated by Dart's `main()` after the module is loaded
  var dartBridge: DartBridge | undefined;
}

/* v8 ignore start — the short-circuit chain takes opposite paths in Node
   vs. the browser runner; both runtimes are covered by the test matrix but
   neither sees both halves of every `&&`. */
const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;
/* v8 ignore stop */

/**
 * Load and initialize the compiled Dart bridge.
 * @param options - Runtime options (currently just the wasm URL).
 * @returns The bridge handle exposed by the Dart `main()` function.
 */
export async function loadBridge(
  options: RuntimeOptions,
): Promise<DartBridge> {
  // Fail fast with a clear, actionable message if the runtime is missing
  // Wasm-GC or JS-string builtins, rather than letting WebAssembly.compile
  // throw something opaque from inside the loader.
  assertWasmGcSupported();

  const loader = (await import(
    './generated/bridge-wasm.js'
  )) as unknown as WasmLoader;

  const url = await resolveWasmUrl(options.wasmUrl);
  const response = await fetchWasm(url);

  const compiled = await loader.compileStreaming(response);
  const instance = await compiled.instantiate({});
  instance.invokeMain();

  const bridge = globalThis.dartBridge;
  /* v8 ignore start — defensive: Dart's `main()` always sets this */
  if (!bridge) {
    throw new Error('Dart Wasm module did not expose globalThis.dartBridge');
  }
  /* v8 ignore stop */
  return bridge;
}

interface InstantiatedApp {
  invokeMain(...args: unknown[]): void;
}

interface CompiledApp {
  instantiate(
    additionalImports?: Record<string, unknown>,
  ): Promise<InstantiatedApp>;
}

interface WasmLoader {
  compileStreaming(
    source: Response | Promise<Response>,
  ): Promise<CompiledApp>;
}

async function resolveWasmUrl(provided?: string | URL): Promise<URL> {
  if (provided) {
    // Resolve strings against this module's URL: bundlers like Vite emit
    // root-relative asset paths (`/assets/bridge-wasm.wasm`), which are not
    // valid URLs on their own. Absolute URLs pass through unchanged.
    return provided instanceof URL
      ? provided
      : new URL(provided, import.meta.url);
  }
  // Bundlers (Vite, Webpack 5, Rollup) recognise this pattern and rewrite
  // it to a URL pointing at the asset they emit. In Node it resolves to a
  // file:// URL next to this module.
  return new URL('./generated/bridge-wasm.wasm', import.meta.url);
}

async function fetchWasm(url: URL): Promise<Response> {
  if (url.protocol === 'file:' && isNode) {
    const { readFile } = await import('node:fs/promises');
    const buf = await readFile(url);
    return new Response(buf, {
      headers: { 'content-type': 'application/wasm' },
    });
  }
  return await fetch(url);
}
