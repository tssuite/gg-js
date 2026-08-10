// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Unit tests for the Node host — the half of the bridge that gg never sees.
//
// Every callback here is what `dart:io` ends up calling once gg runs, so
// the tests read like a `dart:io` conformance suite: the same operations,
// against a real temp directory, with the same expectations.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
  createNodeHost,
  nodePlatformToDart,
  readLineFrom,
} from '../host-node.js';
import {
  EntityType,
  type GgHost,
  type StartedProcess,
} from '../host.js';

describe('createNodeHost()', () => {
  let tmp: string;
  let host: GgHost;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gg-host-')));
    host = createNodeHost({ workingDirectory: tmp });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // ###########################################################################
  describe('fs', () => {
    test('answers typeOf for files, directories, links and gaps', () => {
      fs.writeFileSync(path.join(tmp, 'file.txt'), 'x');
      fs.mkdirSync(path.join(tmp, 'dir'));
      fs.symlinkSync(path.join(tmp, 'file.txt'), path.join(tmp, 'link.txt'));

      expect(host.fs.typeOf(path.join(tmp, 'file.txt'), true)).toBe(
        EntityType.File,
      );
      expect(host.fs.typeOf(path.join(tmp, 'dir'), true)).toBe(
        EntityType.Directory,
      );
      expect(host.fs.typeOf(path.join(tmp, 'link.txt'), false)).toBe(
        EntityType.Link,
      );
      // Followed, the link is the file it points at.
      expect(host.fs.typeOf(path.join(tmp, 'link.txt'), true)).toBe(
        EntityType.File,
      );
      expect(host.fs.typeOf(path.join(tmp, 'nope'), true)).toBe(
        EntityType.NotFound,
      );
    });

    test('resolves relative paths against its own working directory', () => {
      fs.writeFileSync(path.join(tmp, 'rel.txt'), 'relative');

      expect(host.fs.typeOf('rel.txt', true)).toBe(EntityType.File);
      expect(new TextDecoder().decode(host.fs.readBytes('rel.txt'))).toBe(
        'relative',
      );
    });

    test('reads and writes bytes, appending on demand', () => {
      const file = path.join(tmp, 'bytes.bin');
      host.fs.writeBytes(file, new Uint8Array([1, 2, 3]), false);
      expect([...host.fs.readBytes(file)]).toEqual([1, 2, 3]);

      host.fs.writeBytes(file, new Uint8Array([4]), true);
      expect([...host.fs.readBytes(file)]).toEqual([1, 2, 3, 4]);

      host.fs.writeBytes(file, new Uint8Array([9]), false);
      expect([...host.fs.readBytes(file)]).toEqual([9]);
    });

    test('creates directories and files', () => {
      host.fs.createDirectory(path.join(tmp, 'a/b/c'), true);
      expect(fs.existsSync(path.join(tmp, 'a/b/c'))).toBe(true);

      host.fs.createFile(path.join(tmp, 'a/b/c/new.txt'), true);
      expect(fs.readFileSync(path.join(tmp, 'a/b/c/new.txt'), 'utf8')).toBe('');

      // Creating an existing file leaves its content alone.
      fs.writeFileSync(path.join(tmp, 'a/b/c/new.txt'), 'kept');
      host.fs.createFile(path.join(tmp, 'a/b/c/new.txt'), false);
      expect(fs.readFileSync(path.join(tmp, 'a/b/c/new.txt'), 'utf8')).toBe(
        'kept',
      );
    });

    test('deletes files, links and directories', () => {
      fs.writeFileSync(path.join(tmp, 'gone.txt'), 'x');
      host.fs.deleteEntity(path.join(tmp, 'gone.txt'), false);
      expect(fs.existsSync(path.join(tmp, 'gone.txt'))).toBe(false);

      fs.writeFileSync(path.join(tmp, 'target.txt'), 'x');
      fs.symlinkSync(path.join(tmp, 'target.txt'), path.join(tmp, 'l'));
      host.fs.deleteEntity(path.join(tmp, 'l'), false);
      expect(fs.existsSync(path.join(tmp, 'target.txt'))).toBe(true);

      fs.mkdirSync(path.join(tmp, 'tree/sub'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'tree/sub/f.txt'), 'x');
      host.fs.deleteEntity(path.join(tmp, 'tree'), true);
      expect(fs.existsSync(path.join(tmp, 'tree'))).toBe(false);
    });

    test('lists directories flat and recursively', () => {
      fs.mkdirSync(path.join(tmp, 'list/sub'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'list/top.txt'), 'x');
      fs.writeFileSync(path.join(tmp, 'list/sub/deep.txt'), 'x');
      fs.symlinkSync(
        path.join(tmp, 'list/top.txt'),
        path.join(tmp, 'list/link.txt'),
      );

      const flat = host.fs.listDirectory(path.join(tmp, 'list'), false);
      expect(flat.map((e) => path.basename(e.path)).sort()).toEqual([
        'link.txt',
        'sub',
        'top.txt',
      ]);
      expect(flat.find((e) => e.path.endsWith('sub'))?.type).toBe(
        EntityType.Directory,
      );
      expect(flat.find((e) => e.path.endsWith('link.txt'))?.type).toBe(
        EntityType.Link,
      );
      expect(flat.find((e) => e.path.endsWith('top.txt'))?.type).toBe(
        EntityType.File,
      );

      const deep = host.fs.listDirectory(path.join(tmp, 'list'), true);
      expect(deep.map((e) => path.basename(e.path))).toContain('deep.txt');
    });

    test('renames and copies', () => {
      fs.writeFileSync(path.join(tmp, 'from.txt'), 'payload');

      host.fs.rename(path.join(tmp, 'from.txt'), path.join(tmp, 'to.txt'));
      expect(fs.readFileSync(path.join(tmp, 'to.txt'), 'utf8')).toBe('payload');

      host.fs.copyFile(path.join(tmp, 'to.txt'), path.join(tmp, 'copy.txt'));
      expect(fs.readFileSync(path.join(tmp, 'copy.txt'), 'utf8')).toBe(
        'payload',
      );
    });

    test('tracks its working directory without moving the Node process', () => {
      const nodeCwd = process.cwd();

      expect(host.fs.currentDirectory()).toBe(tmp);
      fs.mkdirSync(path.join(tmp, 'inner'));
      host.fs.setCurrentDirectory(path.join(tmp, 'inner'));

      expect(host.fs.currentDirectory()).toBe(path.join(tmp, 'inner'));
      expect(process.cwd()).toBe(nodeCwd);
    });

    test('creates temp directories below a parent', () => {
      const temp = host.fs.createTempDirectory(tmp, 'prefix');
      expect(fs.existsSync(temp)).toBe(true);
      expect(path.basename(temp).startsWith('prefix')).toBe(true);
      expect(host.fs.systemTempDirectory()).toBe(os.tmpdir());
    });

    test('creates, reads and resolves symbolic links', () => {
      fs.writeFileSync(path.join(tmp, 'real.txt'), 'x');
      host.fs.createLink(path.join(tmp, 'sym'), path.join(tmp, 'real.txt'));

      expect(host.fs.linkTarget(path.join(tmp, 'sym'))).toBe(
        path.join(tmp, 'real.txt'),
      );
      expect(host.fs.resolveSymbolicLinks(path.join(tmp, 'sym'))).toBe(
        path.join(tmp, 'real.txt'),
      );
    });

    test('lets a read of a missing file fail', () => {
      // gg asks `typeOf` before it reads; a read that still fails is a real
      // error and must not be swallowed.
      expect(() => host.fs.readBytes(path.join(tmp, 'missing'))).toThrow();
    });
  });

  // ###########################################################################
  describe('process', () => {
    const options = {
      includeParentEnvironment: true,
      runInShell: false,
      detached: false,
    };

    test('runs a program and reports its output', async () => {
      const result = await host.process.run(
        process.execPath,
        ['-e', 'process.stdout.write("out"); process.stderr.write("err")'],
        options,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('out');
      expect(result.stderr).toBe('err');
    });

    test('reports a child killed by a signal as a failure', async () => {
      const result = await host.process.run(
        process.execPath,
        ['-e', 'process.kill(process.pid, "SIGKILL")'],
        options,
      );

      // No exit status exists for a killed process; gg must still see a
      // failure rather than a silent success.
      expect(result.exitCode).toBe(128);
    });

    test('reports a non-zero exit code', async () => {
      const result = await host.process.run(
        process.execPath,
        ['-e', 'process.exit(3)'],
        options,
      );

      expect(result.exitCode).toBe(3);
    });

    test('runs in the requested directory', async () => {
      fs.mkdirSync(path.join(tmp, 'elsewhere'));
      const result = await host.process.run(
        process.execPath,
        ['-e', 'process.stdout.write(process.cwd())'],
        { ...options, workingDirectory: path.join(tmp, 'elsewhere') },
      );

      expect(fs.realpathSync(result.stdout)).toBe(
        path.join(tmp, 'elsewhere'),
      );
    });

    test('passes extra environment variables through', async () => {
      const result = await host.process.run(
        process.execPath,
        ['-e', 'process.stdout.write(process.env.GG_MARKER ?? "")'],
        { ...options, environment: { GG_MARKER: 'set' } },
      );

      expect(result.stdout).toBe('set');
    });

    test('can keep the parent environment out', async () => {
      const isolated = createNodeHost({
        workingDirectory: tmp,
        environment: { KEPT: 'yes' },
      });
      const result = await isolated.process.run(
        process.execPath,
        ['-e', 'process.stdout.write(String(process.env.KEPT))'],
        { ...options, includeParentEnvironment: false },
      );

      expect(result.stdout).toBe('undefined');
    });

    test('reports a missing executable as a failed run', async () => {
      // Throwing here would cross the Wasm boundary as an opaque error;
      // gg expects the shape of a command that ran and failed.
      const result = await host.process.run(
        'gg-js-definitely-not-installed',
        [],
        options,
      );

      expect(result.exitCode).toBe(127);
      expect(result.stderr).not.toBe('');
    });

    test('runs through a shell when asked', async () => {
      const result = await host.process.run('echo hello-shell', [], {
        ...options,
        runInShell: true,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello-shell');
    });

    test('start(detached) returns without waiting', async () => {
      const marker = path.join(tmp, 'detached.txt');
      const started = await host.process.start(
        process.execPath,
        ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`],
        { ...options, detached: true },
      );

      expect(started.pid).toBeGreaterThan(0);

      // A detached child is fire and forget: it reports no output and its
      // exit callback fires at once, because gg never waits for it.
      let exited = -1;
      started.onStdout(() => {});
      started.onStderr(() => {});
      started.onExit((code) => (exited = code));
      expect(exited).toBe(0);
      expect(() => started.writeStdin('ignored')).not.toThrow();
      expect(() => started.closeStdin()).not.toThrow();
    });
  });

  // ###########################################################################
  describe('started processes', () => {
    const options = {
      includeParentEnvironment: true,
      runInShell: false,
      detached: false,
    };

    /** Collects a started process' output and exit code. */
    function collect(started: StartedProcess): Promise<{
      out: string;
      err: string;
      chunks: number;
      code: number;
    }> {
      return new Promise((resolve) => {
        const decoder = new TextDecoder();
        let out = '';
        let err = '';
        let chunks = 0;
        started.onStdout((chunk) => {
          out += decoder.decode(chunk);
          chunks += 1;
        });
        started.onStderr((chunk) => {
          err += decoder.decode(chunk);
        });
        started.onExit((code) => resolve({ out, err, chunks, code }));
      });
    }

    test('streams stdout and stderr and reports the exit code', async () => {
      const started = await host.process.start(
        process.execPath,
        [
          '-e',
          'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)',
        ],
        options,
      );

      const result = await collect(started);
      expect(result.out).toBe('out');
      expect(result.err).toBe('err');
      expect(result.code).toBe(3);
      expect(started.pid).toBeGreaterThan(0);
    });

    test('buffers output produced before a listener arrives', async () => {
      // The whole reason the handle buffers: a fast program can be done
      // before Dart attaches its listeners one microtask later, and gg
      // reading an empty run is exactly the bug this guards.
      const started = await host.process.start(
        process.execPath,
        ['-e', 'process.stdout.write("early")'],
        options,
      );

      await new Promise((r) => setTimeout(r, 200));

      const result = await collect(started);
      expect(result.out).toBe('early');
      expect(result.code).toBe(0);
    });

    test('buffers stderr produced before a listener arrives', async () => {
      const started = await host.process.start(
        process.execPath,
        ['-e', 'process.stderr.write("early-error")'],
        options,
      );

      await new Promise((r) => setTimeout(r, 200));

      expect((await collect(started)).err).toBe('early-error');
    });

    test('delivers output in more than one chunk', async () => {
      const started = await host.process.start(
        'sh',
        ['-c', 'echo one; sleep 0.2; echo two'],
        options,
      );

      const result = await collect(started);
      expect(result.chunks).toBeGreaterThan(1);
      expect(result.out).toBe('one\ntwo\n');
    });

    test('carries stdin into the program', async () => {
      const started = await host.process.start('cat', [], options);
      const done = collect(started);

      started.writeStdin('through stdin');
      started.closeStdin();

      expect((await done).out).toBe('through stdin');
    });

    test('kills a running program', async () => {
      const started = await host.process.start('sleep', ['30'], options);
      const done = collect(started);

      expect(started.kill('SIGTERM')).toBe(true);
      expect((await done).code).not.toBe(0);
    });

    test('falls back to SIGTERM for an unknown signal', async () => {
      const started = await host.process.start('sleep', ['30'], options);
      const done = collect(started);

      expect(started.kill('ProcessSignal.sigwhatever')).toBe(true);
      await done;
    });

    test('reports a missing executable as a failed run', async () => {
      const started = await host.process.start(
        'gg-js-definitely-not-installed',
        [],
        options,
      );

      expect((await collect(started)).code).toBe(127);
    });
  });

  // ###########################################################################
  describe('platform', () => {
    test('reports the environment as entries', () => {
      const scoped = createNodeHost({
        workingDirectory: tmp,
        environment: { A: '1', B: '2' },
      });

      expect(scoped.platform.environmentEntries().sort()).toEqual([
        ['A', '1'],
        ['B', '2'],
      ]);
    });

    test('reports the operating system the way Dart spells it', () => {
      expect(host.platform.operatingSystem()).toBe(
        nodePlatformToDart(process.platform),
      );
      expect(nodePlatformToDart('darwin')).toBe('macos');
      expect(nodePlatformToDart('win32')).toBe('windows');
      expect(nodePlatformToDart('linux')).toBe('linux');
    });

    test('reports the path separator', () => {
      expect(host.platform.pathSeparator()).toBe(path.sep);
    });

    test('remembers the exit code gg asks for', () => {
      expect(host.platform.exitCode()).toBe(0);
      host.platform.setExitCode(42);
      expect(host.platform.exitCode()).toBe(42);
    });
  });

  // ###########################################################################
  describe('console', () => {
    test('routes output to the sinks it was given', () => {
      const out: string[] = [];
      const err: string[] = [];
      const captured = createNodeHost({
        workingDirectory: tmp,
        onStdout: (t) => out.push(t),
        onStderr: (t) => err.push(t),
      });

      captured.console.writeStdout('to-stdout');
      captured.console.writeStderr('to-stderr');

      expect(out).toEqual(['to-stdout']);
      expect(err).toEqual(['to-stderr']);
    });

    test('writes to the real streams by default', () => {
      expect(() => host.console.writeStdout('')).not.toThrow();
      expect(() => host.console.writeStderr('')).not.toThrow();
    });

    test('answers the terminal questions', () => {
      expect(typeof host.console.hasTerminal()).toBe('boolean');
      expect(typeof host.console.supportsAnsiEscapes()).toBe('boolean');
      expect(host.console.terminalColumns()).toBeGreaterThan(0);
    });

    test('reads one line at a time and stops at end of input', () => {
      // Against a real descriptor rather than the runner's own stdin,
      // which in a worker is a pipe that never closes.
      const file = path.join(tmp, 'input.txt');
      fs.writeFileSync(file, 'first\r\nsecond\nno-newline');
      const fd = fs.openSync(file, 'r');
      try {
        expect(readLineFrom(fd)).toBe('first');
        expect(readLineFrom(fd)).toBe('second');
        // A last line without a trailing newline still counts …
        expect(readLineFrom(fd)).toBe('no-newline');
        // … and after it there is nothing left to answer with.
        expect(readLineFrom(fd)).toBeNull();
      } finally {
        fs.closeSync(fd);
      }
    });

    test('reports end of input on a closed descriptor', () => {
      const file = path.join(tmp, 'closed.txt');
      fs.writeFileSync(file, 'x');
      const fd = fs.openSync(file, 'r');
      fs.closeSync(fd);

      // Reading a closed descriptor throws EBADF, which is »no more
      // input« as far as gg is concerned.
      expect(readLineFrom(fd)).toBeNull();
    });

    test('reads gg answers from the descriptor it was given', () => {
      const file = path.join(tmp, 'answers.txt');
      fs.writeFileSync(file, 'yes\n');
      const fd = fs.openSync(file, 'r');
      try {
        const scripted = createNodeHost({ workingDirectory: tmp, stdinFd: fd });
        expect(scripted.console.readLine()).toBe('yes');
        expect(scripted.console.readLine()).toBeNull();
      } finally {
        fs.closeSync(fd);
      }
    });

    test('ships no prompts — a Node host cannot draw them', () => {
      expect(host.prompts).toBeUndefined();
    });
  });
});
