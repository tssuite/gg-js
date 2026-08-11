// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// `Uri.base` for a Dart module that runs outside a browser.
//
// A Wasm build of Dart answers `Uri.base` from `globalThis.location.href`.
// Node has no `location`, so reading it throws — and `package:path`, which
// the whole gg suite is built on, reads it twice before it does anything
// else:
//
//   * `Style.platform` compares `Uri.base` against a `file:` URI to decide
//     between posix and windows separators. It is a `static final`, so
//     whatever `location` says the first time `path` is used sticks for the
//     lifetime of the module.
//   * `path.current` — what `p.absolute()` resolves against — is
//     `Uri.base` turned back into a file path.
//
// So `location` has to exist before the module runs, and it has to follow
// gg's working directory afterwards. Both are what this file is for.
//
// Nothing here imports from `node:`: the module is loaded on every path,
// including a browser's, where all of it is a no-op.

/** The shape `Uri.base` needs. A browser's `Location` is a superset. */
interface UriBaseLocation {
  href: string;
}

/**
 * Points `globalThis.location` at [href].
 *
 * Does nothing where a real `location` already exists — a browser's is
 * read-only, and there `Uri.base` is right to begin with.
 * @param href - The URL `Uri.base` should report. For gg to treat paths as
 *   file system paths this must be a `file:` URL ending in a slash; see
 *   `directoryToUriBase` in `host-node.ts`.
 */
export function setUriBase(href: string): void {
  const existing = (globalThis as { location?: UriBaseLocation }).location;

  if (existing === undefined) {
    Object.defineProperty(globalThis, 'location', {
      value: { href },
      writable: true,
      configurable: true,
    });
    return;
  }

  // Ours from an earlier call — keep it in sync. A browser's `Location`
  // rejects the assignment, which is the outcome we want there.
  try {
    existing.href = href;
  } catch {
    // A real Location. Leave it alone.
  }
}

/**
 * Makes sure `Uri.base` can be read at all, without claiming a directory.
 *
 * Called before the Wasm module starts so that merely loading it cannot
 * throw. The host refines it to the real working directory afterwards.
 */
export function ensureUriBase(): void {
  const existing = (globalThis as { location?: UriBaseLocation }).location;
  if (existing !== undefined) return;

  setUriBase('file:///');
}
