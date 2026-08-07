// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Runtime feature detection for the capabilities `dart compile wasm` requires.
//
// dart2wasm emits modules that use:
//   1. Wasm GC (struct/array types, reference types)
//   2. The JS-string builtins proposal (`{ builtins: ['js-string'] }`)
//
// Both are recent additions. We probe them before attempting to load the
// `.wasm` bundle so the caller gets a clear, actionable error instead of an
// obscure `WebAssembly.compile` failure deep in the loader.

/** Outcome of a Wasm-GC capability probe. */
export interface WasmGcSupport {
  /** True iff all required features are available. */
  supported: boolean;
  /** Human-readable reasons when [supported] is false; empty otherwise. */
  reasons: string[];
}

// Minimal Wasm module that defines one struct type. Validates iff the
// runtime understands the GC type proposal.
//
//   00 61 73 6d   "\0asm"           magic
//   01 00 00 00   version 1
//   01            type section
//   05            section size = 5
//   01            one type
//   5f            sub-type form: struct
//   01            one field
//   78            field type: i64
//   01            field mutability: var
const GC_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x5f, 0x01,
  0x78, 0x01,
]);

// Empty Wasm module. Used together with the `builtins` option to probe
// whether the JS-string builtins proposal is available — engines without
// the proposal reject the option as malformed.
const EMPTY_MODULE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
]);

/**
 * Probe whether the current runtime supports the WebAssembly features
 * `dart compile wasm` relies on (Wasm-GC plus the JS-string builtins).
 * Pure feature detection — does not throw and does not load any bundle.
 * @returns A {@link WasmGcSupport} describing the outcome.
 */
export function checkWasmGcSupport(): WasmGcSupport {
  const reasons: string[] = [];

  if (typeof WebAssembly === 'undefined') {
    return {
      supported: false,
      reasons: ['WebAssembly is not available in this runtime.'],
    };
  }

  try {
    if (!WebAssembly.validate(GC_PROBE)) {
      reasons.push(
        'WebAssembly garbage collection (Wasm-GC) is not supported.',
      );
    }
  } catch {
    reasons.push(
      'WebAssembly.validate threw on a GC probe — runtime is non-standard.',
    );
  }

  try {
    // The `builtins` option is part of the JS-string-builtins proposal.
    // Older engines either ignore the second argument silently (returning
    // true) or throw — we treat a throw as a clear "unsupported" signal.
    // The TS lib only declares a 1-arg signature so we cast.
    const validateWith2Args = WebAssembly.validate as (
      bytes: BufferSource,
      options?: { builtins?: readonly string[] },
    ) => boolean;
    validateWith2Args(EMPTY_MODULE, { builtins: ['js-string'] });
  } catch {
    reasons.push(
      'WebAssembly JS-string builtins (`{ builtins: ["js-string"] }`) ' +
        'are not supported.',
    );
  }

  return { supported: reasons.length === 0, reasons };
}

/**
 * Like {@link checkWasmGcSupport}, but throws an `Error` with a complete,
 * user-facing message when support is missing.
 */
export function assertWasmGcSupported(): void {
  const result = checkWasmGcSupport();
  if (result.supported) return;

  const message = [
    'gg-bridge-dart-typescript requires a WebAssembly runtime with the ' +
      'GC proposal and the JS-string builtins, but the current environment ' +
      'does not support them.',
    '',
    'Supported environments:',
    '  • Node.js ≥ 22',
    '  • Chrome / Edge ≥ 119',
    '  • Firefox ≥ 120',
    '  • Safari ≥ 18.4',
    '',
    'Detected limitations:',
    ...result.reasons.map((r) => `  • ${r}`),
  ].join('\n');

  throw new Error(message);
}
