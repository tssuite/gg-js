# Examples

Two ready-to-run consumers of the bridge — pick whichever runtime you want
to see first.

## Browser (Vite dev server)

```bash
pnpm build:dart        # produce typescript/generated/bridge-{js,wasm}.{ts,wasm}
pnpm example:browser   # http://localhost:5174
```

Loads the `.wasm` via Vite's `?url` import — the bundler copies it next to
the served JS automatically. All four examples are exercised on page load.

## Node CLI

```bash
pnpm build:dart
pnpm example:node
```

Uses the Node entry of the bridge, which reads the `.wasm` file from disk
via `node:fs/promises`. Requires Node ≥ 22 (for Wasm-GC).
