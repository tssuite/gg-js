// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, describe, expect, test, vi } from 'vitest';
import { assertWasmGcSupported, checkWasmGcSupport } from '../compat.js';

describe('Wasm-GC compatibility probe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('reports support in the current runtime', () => {
    const r = checkWasmGcSupport();
    expect(r.supported).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  test('assert form does not throw on a supported runtime', () => {
    expect(() => assertWasmGcSupported()).not.toThrow();
  });

  test('flags missing WebAssembly entirely', () => {
    const original = (globalThis as { WebAssembly?: unknown }).WebAssembly;
    (globalThis as { WebAssembly?: unknown }).WebAssembly = undefined;
    try {
      expect(() => assertWasmGcSupported()).toThrowError(
        /requires a WebAssembly runtime/,
      );
      const r = checkWasmGcSupport();
      expect(r.supported).toBe(false);
      expect(r.reasons[0]).toMatch(/WebAssembly is not available/);
    } finally {
      (globalThis as { WebAssembly?: unknown }).WebAssembly = original;
    }
  });

  test('flags absence of Wasm-GC when validate returns false', () => {
    vi.spyOn(WebAssembly, 'validate').mockImplementation(() => false);
    const r = checkWasmGcSupport();
    expect(r.supported).toBe(false);
    expect(r.reasons).toContain(
      'WebAssembly garbage collection (Wasm-GC) is not supported.',
    );
  });

  test('flags Wasm-GC when validate throws on the GC probe', () => {
    vi.spyOn(WebAssembly, 'validate').mockImplementationOnce(() => {
      throw new Error('non-standard runtime');
    });
    const r = checkWasmGcSupport();
    expect(r.supported).toBe(false);
    expect(r.reasons[0]).toMatch(/WebAssembly\.validate threw/);
  });

  test('flags missing JS-string builtins when validate throws on options', () => {
    const realValidate = WebAssembly.validate.bind(WebAssembly);
    vi.spyOn(WebAssembly, 'validate').mockImplementation((bytes, opts) => {
      if (opts !== undefined) {
        throw new Error('builtins option not understood');
      }
      return realValidate(bytes);
    });
    const r = checkWasmGcSupport();
    expect(r.supported).toBe(false);
    expect(r.reasons).toContain(
      'WebAssembly JS-string builtins (`{ builtins: ["js-string"] }`) ' +
        'are not supported.',
    );
  });
});
