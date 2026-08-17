// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The published bundle, imported the way a consumer imports it.
//
// Everything under `typescript/test/` runs against the TypeScript sources,
// so none of it can see what the bundler did. That gap is not theoretical:
// `node:readline` was once missing from vite's external list, which left
// `createInterface` undefined in `dist/` and broke every interactive
// prompt — while the unit tests stayed green, because they never touched
// the bundle.
//
// These tests need a build: run `pnpm run build` first.

import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, test } from 'vitest';


import type * as ggwsm from '../index.js';

const distIndex = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

describe('the built bundle', () => {
  let gg: typeof ggwsm;

  beforeAll(async () => {
    if (!fs.existsSync(distIndex)) {
      throw new Error(
        `${distIndex} is missing. Run \`pnpm run build\` before the e2e tests.`,
      );
    }
    gg = (await import(distIndex)) as typeof ggwsm;
  });

  test('exports the public API', () => {
    expect(typeof gg.init).toBe('function');
    expect(typeof gg.runGg).toBe('function');
    expect(typeof gg.createNodeHost).toBe('function');
    expect(typeof gg.createNodePrompts).toBe('function');
  });

  test('builds a Node host whose file system answers', () => {
    // Reaches node:fs, node:os and node:path through the bundle.
    const host = gg.createNodeHost();

    expect(host.fs.currentDirectory()).not.toBe('');
    expect(host.fs.systemTempDirectory()).not.toBe('');
    expect(host.platform.operatingSystem()).toBe(
      gg.nodePlatformToDart(process.platform),
    );
  });

  test('asks a prompt and reads the answer', async () => {
    // The one that would have caught the missing `node:readline`: this
    // goes through `createInterface` in the bundled code.
    const written: string[] = [];
    const prompts = gg.createNodePrompts({
      write: (text) => written.push(text),
      input: Readable.from(['2\n']),
    });

    expect(await prompts.select('Pick', ['a', 'b'], 0)).toBe(1);
    expect(written.join('')).toContain('Pick');
  });

  test('edits a message through a prompt', async () => {
    const prompts = gg.createNodePrompts({
      write: () => {},
      input: Readable.from(['edited\n']),
    });

    expect(await prompts.input('Message', '', 'seed', true)).toBe('edited');
  });

  test('keeps an argument whole when gg asks for a shell', async () => {
    // `shell: true` in Node joins the arguments with spaces and quotes
    // nothing, so this used to arrive as three arguments — and warn with
    // DEP0190 on the way. gg passes commit messages through here.
    const host = gg.createNodeHost();
    const result = await host.process.run(
      process.execPath,
      [
        '-e',
        'console.log(JSON.stringify(process.argv.slice(1)))',
        'fix the bug',
        'a;b',
      ],
      { includeParentEnvironment: true, runInShell: true, detached: false },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(['fix the bug', 'a;b']);
  });

  test('runs a program through the host', async () => {
    // Reaches node:child_process through the bundle.
    const host = gg.createNodeHost();
    const result = await host.process.run(
      process.execPath,
      ['-e', 'process.stdout.write("from the bundle")'],
      { includeParentEnvironment: true, runInShell: false, detached: false },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('from the bundle');
  });
});
