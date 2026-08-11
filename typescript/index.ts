// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { loadBridge, type RuntimeOptions } from './runtime.js';
import type { GgHost } from './host.js';

export {
  assertWasmGcSupported,
  checkWasmGcSupport,
  type WasmGcSupport,
} from './compat.js';

export {
  EntityType,
  type ConsoleHost,
  type DirectoryEntry,
  type FileSystemHost,
  type GgHost,
  type PlatformHost,
  type ProcessHost,
  type ProcessOutcome,
  type PromptHost,
  type RunOptions,
} from './host.js';

export {
  createNodeHost,
  nodePlatformToDart,
  type NodeHostOptions,
} from './host-node.js';

export {
  askOnTerminal,
  chooseByArrows,
  chooseByNumber,
  createNodePrompts,
  UnansweredPromptError,
  type NodePromptOptions,
} from './prompts-node.js';

// -----------------------------------------------------------------------------
// The bridge surface. Hand-written, and matched on the Dart side by
// `lib/src/main.dart`. `tsc --emitDeclarationOnly` turns it into
// `dist/index.d.ts`.
// -----------------------------------------------------------------------------

/** The compiled `gg` command line. */
export interface GgBridge {
  /** The version of the `gg` command line inside this module. */
  readonly version: string;
  /** Installs the host gg runs on. Call before {@link GgBridge.run}. */
  setHost(host: GgHost): void;
  /** Removes the installed host. */
  clearHost(): void;
  /** Runs `gg` with `args` and resolves with the exit code. */
  run(args: string[]): Promise<number>;
}

/** Options for {@link init}. */
export type InitOptions = RuntimeOptions;

/**
 * The bridge as the Wasm module hands it over.
 *
 * Identical to {@link GgBridge}; the distinction exists only so
 * {@link init} can wrap it.
 */
type RawBridge = GgBridge;

/**
 * The bridge with its preconditions checked on the JavaScript side.
 *
 * A Dart exception crossing the Wasm boundary arrives in JS as an opaque
 * `WebAssembly.Exception` — unreadable, and unusable in a `catch`. Anything
 * that can be caught before the boundary therefore is.
 */
class GuardedBridge implements GgBridge {
  /**
   * Wraps the raw bridge.
   * @param raw - The object the Wasm module published.
   */
  constructor(private readonly raw: RawBridge) {}

  private hasHost = false;

  /** The version of the `gg` command line inside this module. */
  get version(): string {
    return this.raw.version;
  }

  /**
   * Installs the host gg runs on.
   * @param host - Where gg gets its files, processes and console from.
   */
  setHost(host: GgHost): void {
    this.raw.setHost(host);
    this.hasHost = true;
  }

  /** Removes the installed host. */
  clearHost(): void {
    this.raw.clearHost();
    this.hasHost = false;
  }

  /**
   * Runs `gg` with `args`.
   * @param args - The command line, without the leading `gg`.
   * @returns The exit code gg finished with.
   */
  async run(args: string[]): Promise<number> {
    if (!this.hasHost) {
      throw new Error(
        'gg-js: call setHost(...) before run(...). Without a host gg has ' +
          'no file system, no processes and no console.',
      );
    }
    return this.raw.run(args);
  }
}

let cached: GgBridge | undefined;

/**
 * Loads the WebAssembly module holding the `gg` command line.
 *
 * Idempotent: repeated calls return the same instance. The returned bridge
 * has no host yet — call {@link GgBridge.setHost} before running anything,
 * or use {@link runGg}, which does it for you.
 * @param options - Runtime options (the wasm URL, mostly).
 * @returns The bridge handle.
 */
export async function init(options: InitOptions = {}): Promise<GgBridge> {
  if (cached) return cached;
  cached = new GuardedBridge(await loadBridge(options));
  return cached;
}

/** Options for {@link runGg}. */
export interface RunGgOptions extends InitOptions {
  /**
   * The host gg runs on.
   *
   * Defaults to `createNodeHost()`, which is what you want in Node. Pass
   * your own to sandbox gg, to capture its output, or to run it against an
   * in-memory file system.
   */
  host?: GgHost;
}

/**
 * Runs `gg` with the given command line and returns its exit code.
 *
 * ```ts
 * const code = await runGg(['do', 'ls', 'repos']);
 * ```
 * @param args - The command line, without the leading `gg`.
 * @param options - The host to run on and the runtime options.
 * @returns The exit code gg finished with.
 */
export async function runGg(
  args: string[],
  options: RunGgOptions = {},
): Promise<number> {
  const bridge = await init(options);
  const { createNodeHost } = await import('./host-node.js');
  bridge.setHost(options.host ?? createNodeHost());
  return bridge.run(args);
}

/** Resets the cached bridge — useful in tests. */
export function _resetForTests(): void {
  cached = undefined;
}
