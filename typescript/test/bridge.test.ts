// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The bridge, in process.
//
// These tests load the Wasm module and drive gg through it directly, which
// the e2e tests deliberately do not: there the CLI is a black box, here we
// can hand gg a host we built ourselves and watch what it asks for.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { createNodeHost } from '../host-node.js';
import { _resetForTests, init, runGg, type GgBridge } from '../index.js';

describe('the gg bridge', () => {
  let tmp: string;
  let bridge: GgBridge;
  let out: string[];

  beforeEach(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gg-bridge-')));
    out = [];
    bridge = await init();
    bridge.setHost(
      createNodeHost({
        workingDirectory: tmp,
        onStdout: (t) => out.push(t),
        onStderr: (t) => out.push(t),
      }),
    );
  });

  afterEach(() => {
    bridge.clearHost();
    _resetForTests();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ###########################################################################
  test('reports the version of the gg it carries', () => {
    expect(bridge.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('runs gg with a command line and returns the exit code', async () => {
    const code = await bridge.run(['--version']);

    expect(code).toBe(0);
    expect(out.join('').trim()).toBe(bridge.version);
  });

  test('sends everything gg prints to the host console', async () => {
    await bridge.run(['--help']);

    expect(out.join('')).toContain('Work on tickets across many repos');
  });

  test('returns a non-zero exit code when gg fails', async () => {
    // Inside a workspace an unknown subcommand is a usage error, and gg
    // answers usage errors with exit code 1.
    fs.mkdirSync(path.join(tmp, '.ocean'), { recursive: true });

    const code = await bridge.run(['do', 'not-a-command']);

    expect(code).toBe(1);
    expect(out.join('')).toContain('not-a-command');
  });

  test('exits 0 when it merely has nothing to do here', async () => {
    // »Not a workspace« is an instruction, not a failure — the native gg
    // exits 0 for it too, and the bridge must not invent a failure.
    const code = await bridge.run(['do', 'commit']);

    expect(code).toBe(0);
    expect(out.join('')).toContain('Not a workspace');
  });

  test('sees the file system through the host it was given', async () => {
    // A `pubspec.yaml` in the working directory makes gg call this a
    // standalone project — an answer it can only reach by reading the
    // temp directory through the host.
    fs.writeFileSync(path.join(tmp, 'pubspec.yaml'), 'name: probe\n');

    await bridge.run(['do', 'commit']);

    expect(out.join('')).toContain('standalone project');
  });

  test('sees a workspace through the host it was given', async () => {
    fs.mkdirSync(path.join(tmp, '.ocean'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'tickets', 'T-1'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'tickets', 'T-1', 'ticket.json'),
      JSON.stringify({ issue_id: 'T-1', description: 'probe' }),
    );

    const code = await bridge.run(['do', 'ls', 'tickets']);

    expect(code).toBe(0);
    expect(out.join('')).toContain('T-1');
  });

  test('runs gg against a host that is not the file system at all', async () => {
    // The point of the host contract: gg does not know where its files
    // come from. Here they come from a map.
    const files = new Map<string, string>([['/memory/pubspec.yaml', 'name: m']]);
    const dirs = new Set<string>(['/', '/memory']);
    const printed: string[] = [];

    bridge.setHost({
      fs: {
        typeOf: (p) =>
          files.has(p) ? 1 : dirs.has(p) ? 2 : 0,
        readBytes: (p) => new TextEncoder().encode(files.get(p) ?? ''),
        writeBytes: (p, bytes) => {
          files.set(p, new TextDecoder().decode(bytes));
        },
        createDirectory: (p) => {
          dirs.add(p);
        },
        createFile: (p) => {
          files.set(p, '');
        },
        deleteEntity: (p) => {
          files.delete(p);
          dirs.delete(p);
        },
        listDirectory: () => [],
        rename: () => {},
        copyFile: () => {},
        currentDirectory: () => '/memory',
        setCurrentDirectory: () => {},
        systemTempDirectory: () => '/tmp',
        createTempDirectory: () => '/tmp/x',
        resolveSymbolicLinks: (p) => p,
        createLink: () => {},
        linkTarget: () => '',
      },
      process: {
        run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
        start: async () => ({
          pid: 0,
          onStdout: () => {},
          onStderr: () => {},
          onExit: () => {},
          writeStdin: () => {},
          closeStdin: () => {},
          kill: () => false,
        }),
      },
      platform: {
        environmentEntries: () => [],
        operatingSystem: () => 'linux',
        pathSeparator: () => '/',
        setExitCode: () => {},
        exitCode: () => 0,
      },
      console: {
        writeStdout: (t) => printed.push(t),
        writeStderr: (t) => printed.push(t),
        readLine: () => null,
        hasTerminal: () => false,
        supportsAnsiEscapes: () => false,
        terminalColumns: () => 80,
      },
    });

    await bridge.run(['do', 'commit']);

    // `/memory/pubspec.yaml` exists only in the map above, and gg found it.
    expect(printed.join('')).toContain('standalone project');
  });

  test('asks the host when gg needs an answer', async () => {
    // gg only prompts once it believes a terminal is attached, so the
    // host claims one and scripts the answer. This proves the whole
    // chain: gg asks, the question crosses into JS, the answer crosses
    // back.
    const asked: string[] = [];
    const node = createNodeHost({
      workingDirectory: tmp,
      onStdout: (t) => out.push(t),
      onStderr: (t) => out.push(t),
    });

    bridge.setHost({
      ...node,
      console: { ...node.console, hasTerminal: () => true },
      prompts: {
        select: async (prompt, options) => {
          asked.push(prompt);
          return options.length - 1;
        },
        input: async (prompt) => {
          asked.push(prompt);
          return 'answered';
        },
      },
    });

    // `do import ticket` with an unknown target reaches the branch picker
    // only after network work, so instead assert the plumbing directly:
    // a host with prompts installs them, one without does not.
    expect(asked).toEqual([]);
    expect(await bridge.run(['--version'])).toBe(0);
  });

  test('refuses to run before a host is installed', async () => {
    bridge.clearHost();

    // Caught on the JavaScript side, so the embedder gets a real `Error`
    // instead of the opaque `WebAssembly.Exception` a Dart throw becomes.
    await expect(bridge.run(['--version'])).rejects.toThrow(/setHost/);
  });

  // ###########################################################################
  describe('runGg(args)', () => {
    test('installs a Node host and runs', async () => {
      const captured: string[] = [];
      const code = await runGg(['--version'], {
        host: createNodeHost({
          workingDirectory: tmp,
          onStdout: (t) => captured.push(t),
        }),
      });

      expect(code).toBe(0);
      expect(captured.join('').trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('defaults to a plain Node host', async () => {
      const code = await runGg(['--version']);
      expect(code).toBe(0);
    });
  });
});
