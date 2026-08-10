# Architecture

This document captures the design of `@tssuite/gg-js` — what it is, why
each layer exists, and the trade-offs that were made. It complements
[README.md](README.md), which is task-oriented: install, run, build.

## 1. Goal

Ship the [`gg`](https://github.com/ggsuite/gg) command line on npm, so that

```bash
npx @tssuite/gg-js do ls repos
```

works on a machine with Node and nothing else — no Dart SDK, no
`dart pub global activate`, no per-platform binaries to build and host.

The interesting part is not the packaging. It is that gg is a program made
almost entirely of the things WebAssembly cannot do: reading files, running
`git`, printing to a terminal.

## 2. The problem

`dart compile wasm` produces a `dart:io` that compiles and then throws:

```
UnsupportedError: Unsupported operation: _Namespace
UnsupportedError: Unsupported operation: Process.runSync
UnsupportedError: Unsupported operation: Platform._operatingSystem
UnsupportedError: Unsupported operation: StdIOUtils._getStdioOutputStream
```

A `gg` compiled to Wasm therefore loads fine and dies on the first thing it
tries to do.

The answer is not to reimplement gg. It is to make gg take its file system,
its processes and its console from outside — which is a change to gg, not
to this package. That work is documented in
[gg/doc/wasm-host-delegates.md](https://github.com/ggsuite/gg/blob/main/doc/wasm-host-delegates.md);
this package is the first consumer of it.

## 3. Layout

```
pubspec.yaml          ← Dart package descriptor (publish_to: none)
package.json          ← npm package descriptor

lib/src/main.dart     ← the Wasm entry point: globalThis.ggBridge
lib/src/js_host.dart  ← JS object shapes ⇄ gg's GgHost

typescript/
  host.ts             ← the host contract, as TypeScript types
  host-node.ts        ← the host, implemented on node:fs / node:child_process
  prompts-node.ts     ← the questions gg asks, asked from a Node terminal
  uri-base.ts         ← globalThis.location for a module that has none
  runtime.ts          ← loads and instantiates the .wasm
  compat.ts           ← Wasm-GC feature probe
  index.ts            ← the public API: init(), runGg()
  cli.ts              ← the `gg-js` executable
  generated/          ← gitignored output of build.dart
  test/               ← vitest, in process
  e2e/                ← vitest, spawning the built binary

bin/gg-js.mjs         ← the published shebang wrapper
dist/                 ← gitignored npm artifact
build.dart            ← drives `dart compile wasm`
```

## 4. The bridge

### 4.1 Two methods

`lib/src/main.dart` publishes one object as `globalThis.ggBridge`, with a
deliberately tiny surface:

```dart
void setHost(JSObject callbacks);
JSPromise<JSNumber> run(JSArray<JSString> args);
```

`setHost` converts the JavaScript callbacks into gg's `GgHost` and installs
it; `run` hands gg a command line and resolves with the exit code. There is
no third method, and there is no gg-specific API on the JS side: gg's
interface _is_ its command line, and that is what the bridge exposes.

### 4.2 Everything is a plain JS object

`lib/src/js_host.dart` describes the host with `dart:js_interop` extension
types — zero-cost views onto plain JS objects. Nothing is serialised at the
boundary except the byte arrays, which are shared rather than copied.

Two conversions are worth naming:

- **Errors.** A JS exception arriving in Dart is an opaque object, and gg's
  `on FileSystemException` handlers would not catch it. The file system
  callbacks are wrapped so a failing `fs.readFileSync` surfaces as the
  `FileSystemException` gg expects.
- **Environment.** Handed over as `[[name, value], …]` rather than an
  object, so Dart never has to enumerate JS properties.

### 4.3 Synchronous callbacks

Every file system callback is synchronous. This is not a simplification —
it is forced: gg uses `dart:io`'s `…Sync` APIs throughout, and those cannot
await a promise. Node answers all of them synchronously through `node:fs`,
and the asynchronous `dart:io` APIs are served from the same callbacks.

Process execution is asynchronous on the Dart side (gg awaits every process
it starts) but `spawnSync` on the Node side, which keeps gg's own output
and the child's output in the order the user expects.

### 4.4 `print` is captured

`print` inside a Wasm module goes straight to the JS console, bypassing the
host and any redirection the embedder set up. `run` therefore executes gg
inside a `Zone` whose `print` handler routes to the host console, the same
way `ggLog` output goes.

## 5. `Uri.base`, or: the bug that ate an afternoon

`package:path` — which the entire gg suite is built on — reads `Uri.base`
before it does anything else, twice:

- `Style.platform` compares it against a `file:` URI to decide between
  posix and windows separators — together with `process.platform`, which
  dart2wasm consults for `Uri._isWindows`. It is a `static final`, so the
  first read wins for the lifetime of the module.
- `path.current`, which `p.absolute()` resolves against, is `Uri.base`
  turned back into a file path.

A Wasm build answers `Uri.base` from `globalThis.location.href`. Node has
no `location`, so the first path gg builds traps with `illegal cast`.

`typescript/uri-base.ts` installs one, and `createNodeHost` keeps it
pointed at gg's working directory — including when gg changes it. The
trailing slash matters: `package:path` reads a `file:` URI without one as
»a file, so we must be in a browser« and switches to URL-style paths.

This is also why the package targets Node rather than the browser. In a
browser `location` is real, read-only and an `http:` URL, and gg's paths
would become URLs.

## 6. The host

`typescript/host.ts` is the contract; `typescript/host-node.ts` is the one
implementation this package ships. Three decisions in it are not obvious:

- **gg's working directory is not the process' working directory.** gg
  walks in and out of repositories constantly. `process.chdir` would move
  the surrounding program's cwd with it, so the host tracks its own and
  resolves relative paths against that.
- **A missing executable is a failed run, not an exception.** gg reads the
  stderr of a command that failed; `ENOENT` is reported as exit code 127
  with the message on stderr, the way a shell would.
- **Batch wrappers get a shell.** Node refuses to spawn a `.bat` or
  `.cmd` without one since the fix for CVE-2024-27980, and gg reaches for
  `pana.bat` and `flutter.bat` on Windows without asking for a shell — a
  native Dart build does not need one. `needsShell` decides that here,
  where the platform is known, instead of spreading a Node detail through
  the gg suite.
- **`start` only detaches when asked.** gg uses `Process.start` for two
  different things: reading a program's output, and launching an editor
  that should outlive gg. Only the second gets a detached child.
- **Prompts are asynchronous; the file system is not.** The file
  callbacks have to be synchronous — `dart:io`'s `…Sync` APIs cannot
  await — and a prompt does not, because every caller in gg already
  awaits it. So `prompts-node.ts` reads through `readline` instead of
  blocking on a file descriptor, which is what makes it work on Windows.
  Where the native gg draws an arrow-key list and a pre-filled buffer,
  this draws a numbered list and a line of input — the same questions,
  fewer keystrokes saved.
- **A started process buffers until Dart listens.** `spawn` returns and
  Dart attaches its listeners one microtask later — a fast program can be
  done by then. `NodeStartedProcess` therefore collects output from the
  moment the child exists and replays it when the listener arrives.
  Without that, gg reads an empty test run, which it reports as a
  failure.

## 7. The executable

`bin/gg-js.mjs` is a hand-written two-line file that imports the bundled
`dist/cli.js`. It exists as a source file rather than a build artifact so
the shebang survives bundling.

`cli.ts` loads the module, installs a Node host, runs the arguments and
sets `process.exitCode`. Everything interesting happens on the other side
of the bridge.

## 8. Testing

Three layers, deliberately separate:

| Project   | What it proves                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| `node`    | the host does what `dart:io` expects, against a real temp directory; and gg runs through the bridge in process |
| `e2e`     | `dist/gg-js.mjs` works when spawned as a process, the way npx runs it                                          |
| `browser` | Chromium really has Wasm-GC and the JS-string builtins                                                         |

The e2e tests build a throwaway gg workspace — an ocean, a ticket, a git
repository — and assert on things only the real stack can produce: a
directory walk that finds `.ocean`, a `git status` that comes back clean,
an EOL warning that appears exactly when `.gitattributes` is removed.
Nothing is stubbed.

The in-process tests do what the e2e tests cannot: hand gg a host built out
of a `Map` and watch it find a `pubspec.yaml` that exists nowhere on disk.

## 9. Distribution

- `package.json` declares `bin: { "gg-js": "./dist/gg-js.mjs" }`, which is
  what makes `npx @tssuite/gg-js` work.
- `files: ["dist", "README.md", "LICENSE"]` — the tarball carries build
  artifacts only.
- `prepublishOnly` runs the full build and the full test suite.
- The version is synced from `pubspec.yaml` into `package.json`;
  `pubspec.yaml` is the source of truth.

## 10. Decisions and trade-offs

| Decision             | Choice                          | Why                                                                                         |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| Where the host lives | in `gg`, not here               | Every gg package needs it; an embedder-specific patch would not survive the next gg release |
| Interop style        | `dart:js_interop` + `@JSExport` | Currently recommended; keeps the JS surface explicit in one place                           |
| Compile target       | `dart compile wasm` only        | dart2js' `Future.toJS` / `List.toJS` quirks are not worth apologising for                   |
| fs callbacks         | synchronous                     | `dart:io`'s `…Sync` APIs cannot await                                                       |
| Process execution    | `spawnSync`                     | Keeps gg's output and the child's output in order                                           |
| Preconditions        | checked in TypeScript           | A Dart throw crosses the boundary as an opaque `WebAssembly.Exception`                      |
| Runtime              | Node                            | `Uri.base` in a browser makes `package:path` treat paths as URLs                            |
| Generated artifacts  | gitignored                      | Keeps diffs small; CI rebuilds                                                              |

## 11. What this package is **not**

- Not a reimplementation of gg. It contains no gg logic at all — the Dart
  side is 300 lines of conversion.
- Not a thin shim. It ships the full Dart runtime plus gg: about 1.2 MB of
  `.wasm`.
- Not a browser package, yet. See §5.

## 12. Future work

- **`stdin.readLineSync()` on Windows.** The prompts no longer need a
  blocking read, but gg's interactive publish flow calls `dart:io`'s
  `stdin.readLineSync()` directly, and that one cannot be anything but
  synchronous. It still goes through `fs.readSync` on descriptor 0, which
  a Windows console handle may not answer.
- **An arrow-key selector.** The asynchronous contract leaves room for a
  real TUI prompt on the JS side without touching the contract again.
- **An RxJS entry point** over the callback protocol, for consumers who
  would rather compose gg's output as an `Observable` than register a
  callback. The protocol is deliberately callback-shaped: an `Observable`
  has to be decomposed into `next`/`error`/`complete` functions to cross
  the Wasm boundary anyway, so putting RxJS underneath would cost a
  dependency without removing any interop code.
