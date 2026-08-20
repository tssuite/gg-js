# ggwsm

The [`gg`](https://github.com/ggsuite/gg) command line — the tool that
drives commits, reviews and releases across all repositories of a ticket —
compiled to WebAssembly and published on npm.

```bash
npx @tssuite/ggwsm do ls repos
```

No Dart SDK, no `dart pub global activate`. Node 22+ is enough.

## Install

Run it straight from npm:

```bash
npx @tssuite/ggwsm --help
```

…or put it in a project so everyone working on it gets the same version:

```bash
pnpm add -D @tssuite/ggwsm
```

which makes `ggwsm` available to your scripts:

```json
{
  "scripts": {
    "check": "ggwsm one can commit"
  }
}
```

## What works

Everything the native `gg` does, with the same arguments and the same
output — the file system and the programs gg starts are handed to it by
Node:

```bash
npx @tssuite/ggwsm --version
npx @tssuite/ggwsm --help
npx @tssuite/ggwsm do ls repos
npx @tssuite/ggwsm do ls tickets
npx @tssuite/ggwsm one did commit
```

`gg one can commit` runs the real checks — `dart analyze`, `dart format`
and `dart test` with coverage — and reports what the native gg reports.

Two things behave differently from the native executable — see
[Limitations](#limitations).

## Using it from TypeScript

The package is a library as well as a binary. `runGg` loads the module,
gives it a Node host and runs a command line:

```ts
import { runGg } from '@tssuite/ggwsm';

const exitCode = await runGg(['do', 'ls', 'repos']);
```

To capture the output instead of printing it, build the host yourself:

```ts
import { createNodeHost, init } from '@tssuite/ggwsm';

const output: string[] = [];
const gg = await init();

gg.setHost(
  createNodeHost({
    workingDirectory: '/path/to/workspace',
    onStdout: (text) => output.push(text),
    onStderr: (text) => output.push(text),
  }),
);

const exitCode = await gg.run(['do', 'ls', 'repos']);
console.log(output.join(''));
```

`createNodeHost` never touches the surrounding Node process: gg's working
directory is tracked inside the host, so `process.chdir` is never called.

### Running gg on something that is not a disk

`setHost` takes any object implementing `GgHost` — file system, processes,
platform and console. Nothing in gg knows where its files come from, so a
host backed by a map works as well as one backed by `node:fs`:

```ts
import { EntityType, type GgHost } from '@tssuite/ggwsm';

const files = new Map<string, string>([['/work/pubspec.yaml', 'name: demo']]);

const host: GgHost = {
  fs: {
    typeOf: (p) => (files.has(p) ? EntityType.File : EntityType.NotFound),
    readBytes: (p) => new TextEncoder().encode(files.get(p) ?? ''),
    // …the rest of FileSystemHost
  },
  // …process, platform, console
};
```

That is how gg is tested, and how you would sandbox it.

## Limitations

- **Interactive prompts are rebuilt, not borrowed.** The native gg draws
  them with `package:interact`, which needs `dart:ffi` — something
  WebAssembly does not have. They are rebuilt on `node:readline` here and
  behave the same: the selection lists are walked with the arrow keys,
  and the message editors start with gg's proposal in the buffer, ready
  to be edited. Away from a terminal — a pipe, CI — there is nothing to
  draw on, so a list falls back to numbered choices and an editor to a
  suggestion in brackets that an empty answer keeps. Pass
  `prompts: false` to `createNodeHost` to turn them off entirely, and gg
  refuses the interactive commands instead.
- **Node only, for now.** The module loads in a browser, but
  `package:path` derives its path style from the page URL and would treat
  gg's paths as URLs.
- **Windows is new.** CI runs there now, and the known Windows-specific
  traps are handled: `package:path` picks the Windows style, batch
  wrappers like `pana.bat` are given the shell Node requires, and the
  prompts read through `readline` rather than blocking on a console
  handle — which is also what gives them their line editing. What remains unproven is `dart:io`'s own `stdin.readLineSync()`,
  which gg uses in the interactive publish flow and which cannot be
  anything but a synchronous read.

## Requirements

Node 22 or newer, on a runtime with WebAssembly-GC and the JS-string
builtins. `init()` probes for both and throws a readable error if either is
missing, rather than failing inside the loader.

## Building from source

```bash
pnpm install
pnpm run build     # dart compile wasm + tsc + vite
pnpm test          # dart tests, vitest, e2e, lint
```

`pnpm run build:dart:debug` produces an unoptimised module with source maps
when a stack trace out of the Wasm side needs reading.

## How it works

`gg` is a Dart program, and a Dart program compiled to WebAssembly has no
file system, no way to start a process and no terminal. gg therefore takes
all of that as a set of callbacks, and this package supplies them from
Node.

[README.architecture.md](README.architecture.md) has the details;
[the gg side of the story](https://github.com/ggsuite/gg/blob/main/doc/wasm-host-delegates.md)
documents what had to change in gg itself.

## License

MIT
