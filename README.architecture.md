# Architecture

This document captures the design of `gg_bridge_dart_typescript` — what it
is, why each layer exists, and the trade-offs that were made. It complements
[README.md](README.md) (which is task-oriented: install, build, run).

## 1. Goal

Provide a working, minimal example of how to take a Dart package and ship
it on **npm** as a JavaScript module that

- runs in both **Node.js** and the **browser**,
- is available as **JavaScript** _and_ **WebAssembly**,
- has **hand-typed TypeScript declarations**, and
- demonstrates the four most common interop patterns: a function call, a
  class with sync + async methods, JSON exchange, and a JS callback invoked
  by Dart.

The package doubles as a worked example; the bundled examples are
illustrative, not load-bearing for production.

## 2. Hybrid project layout

A single directory holds both a Dart package and an npm package. The two
toolchains coexist at the root:

```
pubspec.yaml          ← Dart package descriptor (publish_to: none)
package.json          ← npm package descriptor (publish to npm)

lib/                  ← Dart sources (consumed only by build.dart and Dart tests)
test/                 ← Dart unit tests

typescript/           ← TypeScript sources (the npm-facing API)
  generated/          ← gitignored output of build.dart

dist/                 ← gitignored npm artifact (output of tsc + vite build)

example/              ← runnable demo apps (browser + Node CLI)
scripts/              ← Dart helper scripts (sync_version.dart, …)
build.dart            ← orchestrates dart compile js + dart compile wasm
```

The two ecosystems do not share lockfiles or dependency resolution. They
share only the root directory, the version number (synced from `pubspec.yaml`
into `package.json` by `scripts/sync_version.dart`), and the build pipeline.

## 3. Pipeline overview

```
                  ┌───────────────────────────────┐
                  │  pubspec.yaml (version master)│
                  └──────────────┬────────────────┘
                                 │ scripts/sync_version.dart
                                 ▼
                          package.json
                                 │
       ┌─────────────────────────┼────────────────────────────┐
       │                         │                            │
       ▼                         ▼                            ▼
  dart compile js          dart compile wasm             tsc + vite build
  ─────────────────        ────────────────────         ──────────────────
  lib/src/main.dart   →    lib/src/main.dart      →     typescript/index.ts
  typescript/generated/    typescript/generated/        dist/index.js
    bridge-js.ts             bridge-wasm.ts             dist/index.browser.js
                             bridge-wasm.wasm           dist/index.node.js
                                                        dist/index.d.ts
```

`pnpm run build` runs all four steps in order. The result is `dist/`, ready
for `pnpm publish`.

## 4. The Dart side

### 4.1 Pure-Dart library

`lib/src/example_*.dart` implement the actual logic in **plain, idiomatic
Dart**. They have no `dart:js_interop` imports and are unit-testable from
Dart via `package:test` (see `test/example_*_test.dart`). This separation
matters: it lets you write and debug the domain logic without involving
the bridge at all.

### 4.2 The bridge: `lib/src/main.dart`

The bridge is a thin adapter. It depends on `dart:js_interop` and
`dart:js_interop_unsafe` and does three things:

1. **Marks a class with `@JSExport`** (`DartBridge`). Every public method
   becomes a method on the resulting JS object.
2. **Converts at the boundary** — `String` ↔ `JSString`, `List<String>` ↔
   `JSArray<JSString>`, `Future<int>` ↔ `JSPromise<JSNumber>`, JS function
   handles invoked via `JSFunction.callAsFunction(...)`.
3. **Publishes** the bridge to `globalThis.dartBridge` using
   `globalContext.setProperty(...)` from `dart:js_interop_unsafe`.

A single `_guard()` helper wraps every public method to convert Dart
exceptions into JS-throwable error messages. Without it, JS callers see
opaque interop objects.

`dart compile js` and `dart compile wasm` both run `main()` exactly once
when the module is loaded; that is where the global assignment happens.

### 4.3 Why `@JSExport` and not `@JS() external set …`?

The older pattern declares
externally-settable globals:

```dart
@JS() external set foo(JSFunction f);
void main() { foo = _foo.toJS; }
```

`@JSExport` + `createJSInteropWrapper` is the **currently recommended**
pattern. It yields a structured object, supports classes and inheritance,
and keeps the JS surface explicit in one place. New code should prefer it.

## 5. Building

`build.dart` is a small driver around a single `Process.start` call. It

- compiles `lib/src/main.dart` to `typescript/generated/bridge-wasm.wasm`
  with `dart compile wasm`, and wraps the accompanying `.mjs` loader in
  `typescript/generated/bridge-wasm.ts` (TypeScript-importable, headered
  with `// @ts-nocheck` because the generated code is not typed),
- aborts on a failed compilation (`exit($code)`),
- supports `--debug` (`-O0` + source maps) and `--clean` (wipe `generated/`
  beforehand).

`dart compile js` is not produced. The package targets Wasm only, since
dart2js' interop has notable runtime quirks (`Future.toJS`, `List.toJS`)
that the Wasm path does not exhibit and that this bridge should not have
to apologise for.

Generated files are **gitignored** on purpose. CI rebuilds them; humans
build them locally. This keeps PR diffs small and avoids committing
multi-megabyte minified blobs.

## 6. The TypeScript wrapper

### 6.1 Public API: `typescript/index.ts`

This is the hand-written, hand-typed face of the library. It declares the
shape of the bridge (`interface DartBridge`, `interface Counter`, …) and
exposes a single async entry point:

```ts
export async function init(options?: InitOptions): Promise<DartBridge>;
```

`init()` is **idempotent** — repeated calls return the same instance. This
is the agreed pattern for explicit Wasm initialization: it makes the
async-load step visible at the call site rather than hiding it behind a
lazy singleton inside every method.

### 6.2 Runtime loader: `typescript/runtime.ts`

`loadBridge()` loads the compiled Wasm module. Before touching
`WebAssembly.compile` it calls `assertWasmGcSupported()` from
[`compat.ts`](typescript/compat.ts),
which performs two synchronous feature probes (Wasm-GC struct types and
the JS-string builtins) and throws a user-facing error with the list of
supported environments when either is missing.

Node detection is a one-liner against `process.versions.node`. In Node we
read the `.wasm` file directly via `node:fs/promises`. In the browser the
caller must supply a `wasmUrl` (typically via a bundler import such as
Vite's `?url` suffix); without a bundler, `new URL('./generated/bridge-wasm.wasm', import.meta.url)`
serves as the default and works in both runtimes.

### 6.3 `.d.ts` strategy

The user-facing declarations are produced by **`tsc --emitDeclarationOnly`**
from the typed `index.ts`. This avoids drift between implementation and
types (a hand-written `.d.ts` next to plain JS would have to be kept in
sync manually) and is no less "manual" — a human writes the types in
TypeScript syntax; nothing infers them from Dart annotations.

### 6.4 Browser vs Node entry points

`package.json` declares an `exports` map:

```json
"exports": {
  ".": {
    "types":   "./dist/index.d.ts",
    "browser": "./dist/index.browser.js",
    "node":    "./dist/index.node.js",
    "default": "./dist/index.js"
  },
  "./wasm": "./dist/bridge-wasm.wasm"
}
```

Both `index.browser.ts` and `index.node.ts` are thin re-exports of
`index.ts` today; the split exists so that consumers and bundlers can pick
the right variant when we eventually need environment-specific tweaks.

## 7. The four illustrated patterns

| #   | Pattern               | Dart side                                                                                                                  | JS side                                                                                              | Demonstrates                                                                                                   |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Function call         | `add`, `greet` in `example_function.dart`                                                                                  | `dart.add(2, 3)`                                                                                     | Primitive-in, primitive-out: the simplest possible crossing                                                    |
| 2   | Class + async method  | `Counter` in `example_class.dart`                                                                                          | `dart.createCounter(10)` returns a JS object whose `incrementAsync(...)` returns a `Promise<number>` | `createJSInteropWrapper` on instances; `Future → JSPromise`                                                    |
| 3   | Typed object exchange | `enrichPerson(Person)` in `example_json.dart`; `JSObject` extension types `_PersonJs` / `_EnrichedPersonJs` in `main.dart` | `dart.enrichPerson({ name, age })` → `{ name, age, isAdult }`                                        | Zero-cost typed access to JS object fields via `dart:js_interop` extension types — no `JSON.stringify`/`parse` |
| 4   | JS callback into Dart | `mapWithCallback<T,R>` in `example_callback.dart`                                                                          | `dart.mapWithCallback(items, fn)` — Dart invokes `fn` per element                                    | `JSFunction.callAsFunction(...)` and per-element `JSString ↔ String`                                           |

Each pattern is exercised in three places: a Dart unit test (against the
pure-Dart logic), a TypeScript example file under `typescript/examples/`,
and a Vitest spec that runs through the actual built bridge.

## 8. Testing strategy

Two layers, intentionally separate:

1. **Dart tests** under `test/` validate `lib/src/example_*.dart` directly.
   No interop involved. Fast and easy to debug.
2. **Vitest tests** under `typescript/test/` validate the _bridge_. They
   run twice:
   - `project: 'node'` — `environment: 'node'`, loads `.wasm` from disk.
   - `project: 'browser'` — Vitest Browser Mode with Playwright/Chromium
     headless, loads `.wasm` via `fetch`.

The browser project uses Playwright (not happy-dom or jsdom) because
those DOM shims do not fully support **WebAssembly GC**, which `dart
compile wasm` requires. Testing in a real browser engine is the only way
to validate the Wasm path honestly.

## 9. Examples (`example/`)

Two consumers under `example/` show how a real downstream project
integrates the bridge:

- `example/browser/` — a Vite dev server. `import wasmUrl from
'…/bridge-wasm.wasm?url'` lets Vite copy the `.wasm` next to the
  served JS, which is the idiomatic bundler pattern.
- `example/node-cli/` — a plain Node script using `await` at top level.

These exist _because_ shipping a Dart/Wasm library and shipping a
consumable Dart/Wasm library are different things. The bundler-integration
story is what this package is really documenting.

## 10. Distribution

- `package.json` has `"files": ["dist", "README.md", "LICENSE"]`. The
  `pnpm publish` tarball therefore contains only build artifacts — never
  `lib/`, `node_modules/`, or `.dart_tool/`.
- `prepublishOnly` runs `pnpm run build && pnpm run test`. Forgetting to
  rebuild before publishing is impossible.
- Publishing is **manual** (`pnpm publish`), not automated through CI.
  CI's job is to verify; humans cut releases.

## 11. CI

`.github/workflows/ci.yaml` runs on push and PR. It

- caches `~/.pub-cache` keyed on `pubspec.yaml`,
- caches `~/.local/share/pnpm/store` keyed on `pnpm-lock.yaml`,
- sets up Dart stable, Node 22, pnpm,
- installs Playwright with `--with-deps chromium`,
- runs `dart test`, then `pnpm run build`, then `pnpm run test:vitest`,
  then `pnpm run lint`.

## 12. Decisions and trade-offs

A summary of the explicit calls made when designing this package:

| Decision                   | Choice                                     | Why                                                                                                             |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Interop style              | `dart:js_interop` + `@JSExport`            | Currently recommended Dart pattern; structured surface; future-proof                                            |
| Compile target             | `dart compile wasm` only                   | Wasm-GC has clean interop semantics; dart2js' `Future.toJS` and `List.toJS` quirks made the JS bundle a footgun |
| Runtime                    | Node and browser                           | Both ship from the same package; `exports`-map dispatches                                                       |
| `.d.ts` source             | Generated by `tsc` from a typed `index.ts` | Avoids drift; "manual" stays true at the human authoring level                                                  |
| Generated artifacts in git | Gitignored                                 | Keeps diffs small; CI rebuilds                                                                                  |
| Browser test runtime       | Vitest Browser Mode (Playwright/Chromium)  | happy-dom/jsdom cannot run Wasm-GC honestly                                                                     |
| Version source of truth    | `pubspec.yaml`                             | Dart package metadata is authoritative; sync script writes `package.json`                                       |
| Publishing                 | Manual `pnpm publish`                      | CI verifies, humans release                                                                                     |
| Worker / isolate example   | Deliberately omitted (for now)             | Not "Dart isolates"; would be Web-Worker plumbing instead — separate concern                                    |

## 13. What this package is **not**

- Not a build of Dart Flutter code to JS.
- Not a thin shim — it ships the full Dart-to-JS / Dart-to-Wasm runtime
  per bundle, which is in the **few hundred KB range**. For a `add(a, b)`
  utility this is laughably oversized; the value of this approach is in
  reusing **substantial existing Dart code** on the web.
- Not a monorepo. One Dart package + one npm package coexist; pnpm
  workspaces are not used.
- Not opinionated about state management, frameworks, or UI. The bridge
  is the only thing here.

## 14. Future work

Topics that were discussed and deliberately deferred:

- **Web Worker / `worker_threads` example** to demonstrate offloading
  heavy Dart computation. Requires a separate worker entry compiled from
  a different Dart file plus `postMessage` plumbing.
- **Custom bundler resolvers** for the `.wasm` file (esbuild, Webpack 5,
  Rollup direct). Vite is covered via `?url`.
- **Type-stripped published bundle** — currently `tsc` emits `.js` + `.d.ts`
  and `vite build` produces a friendlier ESM bundle; this could be
  simplified or rebalanced.
- **Source-map quality for Wasm** — works partially in Chromium today,
  not at all in some other engines. Marked as a caveat in the README.
