// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { loadBridge, type RuntimeOptions } from './runtime.js';

export {
  assertWasmGcSupported,
  checkWasmGcSupport,
  type WasmGcSupport,
} from './compat.js';

// -----------------------------------------------------------------------------
// Public TypeScript types — hand-written. These declare the JS-facing API
// that the Dart side promises to deliver. `tsc --emitDeclarationOnly` turns
// them into `dist/index.d.ts`.
// -----------------------------------------------------------------------------

/** A handle to a Dart-backed counter. */
export interface Counter {
  /** Current value. */
  readonly value: number;
  /** Increment by `by` (default 1) and return the new value. */
  increment(by?: number): number;
  /** Wait `delayMs` ms, then increment by `by` (default 1). */
  incrementAsync(delayMs: number, by?: number): Promise<number>;
}

/** Input shape for `enrichPerson`. */
export interface Person {
  name: string;
  age: number;
}

/** Output shape returned by `enrichPerson`. */
export interface EnrichedPerson extends Person {
  isAdult: boolean;
}

/** Output shape returned by `analyzeBytes`. */
export interface ByteAnalysis {
  byteCount: number;
}

/** The bridge surface exposed to JS/TS callers. */
export interface DartBridge {
  /** Add two integers. */
  add(a: number, b: number): number;
  /** Greet a name. */
  greet(name: string): string;
  /** Create a new counter starting at `initial` (default 0). */
  createCounter(initial?: number): Counter;
  /** Enrich a person object with a derived `isAdult` flag. */
  enrichPerson(input: Person): EnrichedPerson;
  /** Apply a JS callback to every entry of `items`. */
  mapWithCallback(items: string[], callback: (item: string) => string): string[];
  /** Count the bytes of a `Uint8Array` and return `{ byteCount }`. */
  analyzeBytes(input: Uint8Array): ByteAnalysis;
}

/** Options for `init()`. */
export type InitOptions = RuntimeOptions;

let cached: DartBridge | undefined;

/**
 * Load and initialize the Dart bridge.
 *
 * Idempotent: repeated calls return the same instance.
 * @param options - Runtime options (target selection, wasm URL, …).
 */
export async function init(options: InitOptions = {}): Promise<DartBridge> {
  if (cached) return cached;
  cached = await loadBridge(options);
  return cached;
}

/** Reset the cached bridge — useful in tests. */
export function _resetForTests(): void {
  cached = undefined;
}
