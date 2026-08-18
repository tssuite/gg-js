// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// End-to-end tests: `dist/ggwsm.mjs` is started as a real child process,
// exactly the way `npx ggwsm` starts it.
//
// Nothing is stubbed here. Every assertion below goes through the whole
// stack — Node spawns the binary, the binary loads the Wasm module, the
// module asks the Node host for files and processes, and gg answers on
// stdout. If the host contract is wrong anywhere, these tests notice.
//
// They need a build: run `pnpm run build` first.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { spawnCommand } from '../host-node.js';

const cli = fileURLToPath(new URL('../../dist/ggwsm.mjs', import.meta.url));

/**
 * Runs the `dart` on PATH.
 *
 * Through a shell, because on Windows `dart` is a batch file — the Flutter
 * SDK ships `bin/dart.bat` — and Node refuses to spawn one directly since
 * CVE-2024-27980, with an `ENOENT` that looks like a missing SDK.
 * `spawnCommand` already builds the shell invocation for both platforms,
 * quoting included, so the fixtures borrow it instead of repeating it.
 * @param args - The dart command line.
 * @param cwd - The directory to run in.
 * @returns What `spawnSync` returned.
 */
function runDart(
  args: string[],
  cwd: string,
): ReturnType<typeof spawnSync<string>> {
  const command = spawnCommand('dart', args, true);
  return spawnSync(command.executable, command.args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** What a finished `ggwsm` run left behind. */
interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr in one string — for »did it say this anywhere«. */
  output: string;
}

/**
 * Runs `ggwsm` as a child process and collects what it produced.
 * @param args - The gg command line.
 * @param cwd - The directory to run in.
 * @returns Exit code and output.
 */
function runCli(args: string[], cwd: string): CliResult {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    // A missing stdin is what a piped run looks like: gg's interactive
    // commands must bail out rather than block the test suite.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  return { status: result.status ?? -1, stdout, stderr, output: stdout + stderr };
}

describe('npx ggwsm', () => {
  let workspace: string;
  let repo: string;
  let dartPackage: string;

  beforeAll(() => {
    if (!fs.existsSync(cli)) {
      throw new Error(
        `${cli} is missing. Run \`pnpm run build\` before the e2e tests.`,
      );
    }

    // A throwaway gg workspace: an ocean holding the pristine clone of one
    // repo, plus one ticket with a working copy of it. That is the smallest
    // shape gg recognises as »inside a ticket«.
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ggwsm-e2e-'));

    const pubspec =
      'name: demo\nversion: 1.0.0\nenvironment:\n  sdk: ">=3.8.0 <4.0.0"\n';

    const ocean = path.join(workspace, '.ocean', 'acme', 'demo');
    fs.mkdirSync(ocean, { recursive: true });
    fs.writeFileSync(path.join(ocean, 'pubspec.yaml'), pubspec);

    repo = path.join(workspace, 'tickets', 'E2E-1', 'acme', 'demo');
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, 'pubspec.yaml'), pubspec);
    fs.writeFileSync(path.join(repo, 'README.md'), '# demo\n');
    // gg refuses to call a repo committed while git's EOL conversion is
    // off, so the fixture carries the .gitattributes it asks for.
    fs.writeFileSync(path.join(repo, '.gitattributes'), '* text=auto eol=lf\n');
    fs.writeFileSync(
      path.join(workspace, 'tickets', 'E2E-1', 'ticket.json'),
      JSON.stringify({
        issue_id: 'E2E-1',
        description: 'e2e',
        repositories: [],
      }),
    );

    // A real git repository, so the commands that shell out to git have
    // something to talk to.
    const git = (...args: string[]): void => {
      const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    git('init', '--initial-branch=main');
    git('config', 'user.email', 'e2e@example.com');
    git('config', 'user.name', 'E2E');
    git('add', '.');
    git('commit', '-m', 'initial');

    dartPackage = buildDartPackage(workspace);
  });

  afterAll(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  /**
   * Writes a minimal but complete Dart package `gg one can commit` accepts.
   *
   * Complete means: analyzable, formatted, one implementation file with a
   * test file next to it, and 100% coverage — gg checks all of that, and
   * anything missing would fail the run for a reason that has nothing to do
   * with the bridge.
   * @param root - Where to put it.
   * @returns The package directory.
   */
  function buildDartPackage(root: string): string {
    const dir = path.join(root, 'dart-package');
    fs.mkdirSync(path.join(dir, 'lib', 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });

    fs.writeFileSync(
      path.join(dir, 'pubspec.yaml'),
      [
        'name: e2e_probe',
        'version: 1.0.0',
        'environment:',
        '  sdk: ">=3.8.0 <4.0.0"',
        'dev_dependencies:',
        '  lints: ^6.0.0',
        '  test: ^1.24.0',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'analysis_options.yaml'),
      'include: package:lints/recommended.yaml\n',
    );
    fs.writeFileSync(
      path.join(dir, 'lib', 'src', 'adder.dart'),
      'int add(int a, int b) => a + b;\n',
    );
    fs.writeFileSync(
      path.join(dir, 'test', 'adder_test.dart'),
      [
        "import 'package:e2e_probe/src/adder.dart';",
        "import 'package:test/test.dart';",
        '',
        'void main() {',
        "  test('adds', () {",
        '    expect(add(2, 3), 5);',
        '  });',
        '}',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(path.join(dir, '.gitattributes'), '* text=auto eol=lf\n');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'coverage/\n.dart_tool/\n');

    const git = (...args: string[]): void => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
    };
    git('init', '--initial-branch=main');
    git('config', 'user.email', 'e2e@example.com');
    git('config', 'user.name', 'E2E');
    git('add', '.');
    git('commit', '-m', 'initial');

    const pub = runDart(['pub', 'get'], dir);
    if (pub.status !== 0) throw new Error(`dart pub get: ${pub.stderr}`);

    return dir;
  }

  // ###########################################################################
  describe('the module loads and runs', () => {
    test('prints the gg version and exits 0', () => {
      const result = runCli(['--version'], workspace);

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });

    test('prints the top level help', () => {
      const result = runCli(['--help'], workspace);

      expect(result.status).toBe(0);
      expect(result.output).toContain('Work on tickets across many repos');
      // The four command groups gg is built around.
      expect(result.output).toContain('can');
      expect(result.output).toContain('did');
      expect(result.output).toContain('do');
      expect(result.output).toContain('one');
    });

    test('prints the help of a subcommand', () => {
      const result = runCli(['do', '--help'], workspace);

      expect(result.status).toBe(0);
      expect(result.output).toContain('Act on all repos of the current ticket');
      expect(result.output).toContain('commit');
      expect(result.output).toContain('publish');
    });

    test('prints the help of the standalone namespace', () => {
      const result = runCli(['one', '--help'], workspace);

      expect(result.status).toBe(0);
      expect(result.output).toContain('Work in standalone repos');
    });
  });

  // ###########################################################################
  describe('the file system reaches gg', () => {
    test('detects the workspace it was started in', () => {
      // Inside a workspace gg accepts the multi-repo commands; the reply
      // proves the `.ocean` marker was found by walking the real disk.
      const result = runCli(['do', 'ls', 'tickets'], workspace);

      expect(result.status).toBe(0);
      expect(result.output).toContain('E2E-1');
    });

    test('reads a repository out of the ticket', () => {
      const result = runCli(['do', 'ls', 'repos'], workspace);

      expect(result.status).toBe(0);
      expect(result.output).toContain('demo');
    });

    test('reads and parses a pubspec.yaml', () => {
      const result = runCli(['do', 'ls', 'deps', 'demo'], workspace);

      expect(result.status).toBe(0);
      expect(result.output).toContain('demo');
      expect(result.output).toContain('1.0.0');
    });

    test('refuses a multi-repo command outside a workspace', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ggwsm-plain-'));
      try {
        const result = runCli(['do', 'commit'], outside);
        expect(result.output).toContain('Not a workspace');
      } finally {
        fs.rmSync(outside, { recursive: true, force: true });
      }
    });

    test('recognises a standalone project and points at `gg one`', () => {
      const standalone = fs.mkdtempSync(path.join(os.tmpdir(), 'ggwsm-solo-'));
      try {
        fs.writeFileSync(path.join(standalone, 'pubspec.yaml'), 'name: solo\n');
        const result = runCli(['do', 'commit'], standalone);
        expect(result.output).toContain('standalone project');
        expect(result.output).toContain('gg one');
      } finally {
        fs.rmSync(standalone, { recursive: true, force: true });
      }
    });
  });

  // ###########################################################################
  describe('processes reach gg', () => {
    test('asks git about the working tree', () => {
      const result = runCli(['one', 'did', 'commit'], repo);

      // »All changes are committed« is `git status` speaking — run by the
      // Node host on gg's behalf, with its output carried back across the
      // Wasm boundary. The fixture was committed with raw git rather than
      // `gg do commit`, so gg's own bookkeeping is missing and it says so.
      expect(result.output).toContain('All changes are committed');
      expect(result.output).toContain('Not committed yet');
      expect(result.status).toBe(1);
    });

    test('asks git about the repository configuration', () => {
      // The EOL advice comes out of `git check-attr`. It appears exactly
      // when the .gitattributes the fixture normally carries is gone —
      // a difference only a real git invocation can produce.
      const attributes = path.join(repo, '.gitattributes');
      const saved = fs.readFileSync(attributes, 'utf8');
      fs.rmSync(attributes);
      try {
        const result = runCli(['one', 'did', 'commit'], repo);
        expect(result.output).toContain('Git automatic EOL conversion is OFF');
      } finally {
        fs.writeFileSync(attributes, saved);
      }
    });

    test('runs a package\'s test suite and agrees with dart test', () => {
      // The regression that motivated the streaming host. gg parses
      // `dart test`'s output line by line; a host that hands the whole run
      // over at once makes it read a passing suite as a failure. This
      // asserts the two agree.
      const direct = runDart(['test'], dartPackage);
      expect(direct.status).toBe(0);

      fs.rmSync(path.join(dartPackage, '.gg', 'gg.json'), { force: true });
      const result = runCli(['one', 'can', 'commit'], dartPackage);

      expect(result.output).toContain('dart test');
      expect(result.output).not.toContain('Tests failed');
      expect(result.status).toBe(0);
    });

    test('reports a missing executable instead of crashing', () => {
      // `gg do exec` runs whatever it is given in every ticket repo. A
      // command that does not exist must come back as a failed run, not as
      // an exception thrown across the Wasm boundary.
      const result = runCli(
        ['do', 'exec', 'ggwsm-no-such-executable'],
        workspace,
      );

      expect(result.status).not.toBe(0);
      expect(result.output).not.toContain('RuntimeError');
    });
  });

  // ###########################################################################
  describe('exit codes and errors', () => {
    test('exits non-zero on an unknown subcommand', () => {
      const result = runCli(['do', 'not-a-command'], workspace);

      expect(result.status).not.toBe(0);
      expect(result.output).toContain('not-a-command');
    });

    test('exits non-zero on an unknown flag', () => {
      const result = runCli(['do', 'ls', 'repos', '--nope'], workspace);

      expect(result.status).not.toBe(0);
    });

    test('reports the error instead of crashing the module', () => {
      const result = runCli(['do', 'not-a-command'], workspace);

      // A Dart exception crossing the bridge unhandled would surface as a
      // wasm RuntimeError; gg's own message means it was handled.
      expect(result.output).not.toContain('RuntimeError');
      expect(result.output).toContain('Usage:');
    });
  });

  // ###########################################################################
  describe('the console reaches gg', () => {
    test('honours NO_COLOR from the environment', () => {
      const result = runCli(['--help'], workspace);

      expect(result.output).not.toMatch(/\x1B\[[0-9;]*m/);
    });

    test('does not hang when stdin is closed', () => {
      // `stdio: ['ignore', …]` above means there is no stdin. An
      // interactive command must fail fast rather than wait forever;
      // vitest' own timeout would catch a regression here.
      const result = runCli(['do', 'ls', 'repos'], workspace);
      expect(result.status).toBe(0);
    });
  });
});
