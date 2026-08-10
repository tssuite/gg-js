# Changelog

## Unreleased

### Added

- The `gg` command line itself, compiled to WebAssembly. `npx @tssuite/gg-js
  <args>` runs it; `bin` in package.json makes the binary available to
  npm scripts as `gg-js`.
- `createNodeHost()` — the file system, process, platform and console
  callbacks gg needs, implemented on `node:fs`, `node:child_process` and
  `process`. It tracks gg's working directory itself rather than moving the
  Node process'.
- `runGg(args, options)` and `init()` for driving gg from TypeScript, with
  any `GgHost` — including one that is not a file system at all.
- End-to-end tests that spawn the built binary as a real process against a
  throwaway gg workspace with a git repository in it.

### Changed

- The bridge is now `globalThis.ggBridge` with two methods, `setHost` and
  `run`. The four interop demo patterns it carried before are gone; the
  package is a tool now, not an example.
- Preconditions are checked in TypeScript, so a misused bridge throws a
  readable `Error` instead of an opaque `WebAssembly.Exception`.

### Fixed

- `globalThis.location` is installed before the module starts.
  `package:path` reads `Uri.base` from it to decide between posix and
  windows separators, and Node has no `location` — without this the first
  path gg built trapped with `illegal cast`.
- Ignore CHANGELOG.md for prettier
- Update dart dependencies
- Update dart and typescript dependencies
- Update to latest dependencies
