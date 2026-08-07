// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { runBytesExample } from '../../typescript/examples/bytes.js';
import { runCallbackExample } from '../../typescript/examples/callback.js';
import { runClassExample } from '../../typescript/examples/class.js';
import { runFunctionExample } from '../../typescript/examples/function.js';
import { runJsonExample } from '../../typescript/examples/json.js';
import wasmUrl from '../../typescript/generated/bridge-wasm.wasm?url';
import { checkWasmGcSupport, init } from '../../typescript/index.js';


async function main(): Promise<void> {
  // Surface a clear message when the browser is missing Wasm-GC support
  // before we even try to load the bundle.
  const support = checkWasmGcSupport();
  if (!support.supported) {
    showUnsupported(support.reasons);
    return;
  }

  // Pre-warm the bridge with the bundler-resolved wasm URL.
  await init({ wasmUrl });

  setText('out-function', await runFunctionExample());
  setText('out-class', await runClassExample());
  setText(
    'out-json',
    JSON.stringify(await runJsonExample({ name: 'Alice', age: 30 }), null, 2),
  );
  setText('out-callback', (await runCallbackExample()).join(', '));
  setText(
    'out-bytes',
    JSON.stringify(
      await runBytesExample(new Uint8Array([1, 2, 3, 4, 5])),
      null,
      2,
    ),
  );
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showUnsupported(reasons: readonly string[]): void {
  const banner = document.createElement('section');
  banner.style.cssText =
    'border: 1px solid #d33; background: #fdd; padding: 1rem; ' +
    'border-radius: 4px; margin-bottom: 1.5rem;';
  banner.innerHTML =
    '<h2 style="margin-top:0;color:#900">Browser not supported</h2>' +
    '<p>This demo requires a WebAssembly runtime with the GC proposal and ' +
    'JS-string builtins. Please use a recent build of Chrome / Edge (≥ 119), ' +
    'Firefox (≥ 120), or Safari (≥ 18.4).</p>';
  const list = document.createElement('ul');
  for (const r of reasons) {
    const li = document.createElement('li');
    li.textContent = r;
    list.append(li);
  }
  banner.append(list);
  document.body.prepend(banner);
}

main().catch((e: unknown) => {
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color: #900; white-space: pre-wrap;';
  pre.textContent = msg;
  document.body.append(pre);
});
