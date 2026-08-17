// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The `ggwsm` executable: `npx @tssuite/ggwsm <args>`.
//
// It is a thin shell around `runGg` — load the Wasm module, give it a Node
// host, hand it the command line, exit with what gg returns. Everything
// interesting happens on the other side of the bridge.

import { createNodeHost } from './host-node.js';
import { init } from './index.js';


/**
 * Runs the CLI.
 * @param argv - The command line, without `node` and the script path.
 * @returns The exit code gg finished with.
 */
export async function main(argv: string[]): Promise<number> {
  try {
    const bridge = await init();
    bridge.setHost(createNodeHost());
    return await bridge.run(argv);
  } catch (error) {
    process.stderr.write(`${describe(error)}\n`);
    return 1;
  }
}

/**
 * Turns whatever crossed the bridge into something worth printing.
 *
 * Dart throws strings across the Wasm boundary, so an `Error` is only one
 * of the shapes that can arrive here.
 * @param error - The thrown value.
 * @returns A human-readable message.
 */
function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message;

  const text = String(error);
  if (text.includes('WebAssembly.Exception')) {
    // A Dart exception that escaped `runGg`'s own handler. There is no
    // message to recover — say so rather than printing `[object …]`.
    return (
      'ggwsm: the WebAssembly module failed with an error that could not ' +
      'cross the boundary. Please report this with the command you ran.'
    );
  }
  return text;
}

/* v8 ignore start — the process-level wiring is covered by the e2e tests,
   which run this file as a real executable. */
if (process.env.ggwsm_SKIP_MAIN !== '1') {
  process.exitCode = await main(process.argv.slice(2));
}
/* v8 ignore stop */
