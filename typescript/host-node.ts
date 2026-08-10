// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The host that gives gg a real machine when it runs under Node.
//
// Everything here is the plainest possible mapping onto `node:fs`,
// `node:child_process` and `process`. The interesting decisions are
// documented where they are made; the rest is a lookup table.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createNodePrompts } from './prompts-node.js';
import { setUriBase } from './uri-base.js';
import {
  EntityType,
  type ConsoleHost,
  type DirectoryEntry,
  type FileSystemHost,
  type GgHost,
  type PlatformHost,
  type ProcessHost,
  type ProcessOutcome,
  type PromptHost,
  type RunOptions,
  type StartedProcess,
} from './host.js';

/** Options for {@link createNodeHost}. */
export interface NodeHostOptions {
  /**
   * Where gg starts. Defaults to the Node process' working directory.
   *
   * gg changes it as it walks a workspace; the change is kept here and
   * never touches the Node process itself.
   */
  workingDirectory?: string;
  /** Overrides `process.env`. */
  environment?: Record<string, string>;
  /** Receives everything gg writes to stdout. Defaults to `process.stdout`. */
  onStdout?: (text: string) => void;
  /** Receives everything gg writes to stderr. Defaults to `process.stderr`. */
  onStderr?: (text: string) => void;
  /**
   * The file descriptor `dart:io`'s `stdin.readLineSync()` reads from.
   * Defaults to stdin.
   *
   * That one call is synchronous and cannot be anything else, so it needs
   * a descriptor rather than a stream. The interactive prompts read from
   * {@link NodeHostOptions.stdin} instead.
   */
  stdinFd?: number;
  /**
   * The stream the interactive prompts read from. Defaults to
   * `process.stdin`.
   *
   * Point it somewhere else to feed gg scripted answers, or to keep it
   * away from a stdin that belongs to the surrounding program.
   */
  stdin?: NodeJS.ReadableStream;
  /**
   * The prompts gg asks its interactive questions with.
   *
   * Defaults to {@link createNodePrompts}. Pass `false` to leave gg
   * without any: it then refuses the interactive commands with a message
   * naming the flag to pass instead. gg guards every prompt behind a
   * terminal check either way, so a piped run never blocks.
   */
  prompts?: PromptHost | false;
}

/**
 * Turns a directory path into the `file:` URL `Uri.base` expects.
 *
 * The trailing slash matters: `package:path` reads a `file:` URI without
 * one as »a file, so we must be in a browser« and switches to URL-style
 * paths, which would break every path gg touches.
 * @param directory - An absolute directory path.
 * @returns The directory as a `file:` URL ending in a slash.
 */
export function directoryToUriBase(directory: string): string {
  const url = pathToFileURL(directory).href;
  return url.endsWith('/') ? url : `${url}/`;
}

/**
 * Builds the Node host.
 * @param options - Overrides for the working directory, environment and
 *   output sinks.
 * @returns A host gg can run on.
 */
export function createNodeHost(options: NodeHostOptions = {}): GgHost {
  // gg's working directory is tracked here rather than through
  // `process.chdir`: gg walks in and out of repositories constantly, and an
  // embedder that runs gg inside a larger Node program must not have its
  // own cwd moved around underneath it.
  let cwd = path.resolve(options.workingDirectory ?? process.cwd());
  let exitCode = 0;

  // `package:path` resolves relative paths against `Uri.base`, so gg's
  // working directory has to be visible there too — see `uri-base.ts`.
  setUriBase(directoryToUriBase(cwd));

  const env = options.environment ?? (process.env as Record<string, string>);

  const absolute = (p: string): string =>
    path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);

  const fileSystem: FileSystemHost = {
    typeOf(p: string, followLinks: boolean): EntityType {
      try {
        const stat = followLinks
          ? fs.statSync(absolute(p))
          : fs.lstatSync(absolute(p));
        if (stat.isSymbolicLink()) return EntityType.Link;
        if (stat.isDirectory()) return EntityType.Directory;
        return EntityType.File;
      } catch {
        // A missing path is an answer, not a failure — `existsSync` in gg
        // asks this question constantly.
        return EntityType.NotFound;
      }
    },

    readBytes: (p) => new Uint8Array(fs.readFileSync(absolute(p))),

    writeBytes(p, bytes, append) {
      fs.writeFileSync(absolute(p), bytes, { flag: append ? 'a' : 'w' });
    },

    createDirectory(p, recursive) {
      fs.mkdirSync(absolute(p), { recursive });
    },

    createFile(p, recursive) {
      const target = absolute(p);
      if (recursive) fs.mkdirSync(path.dirname(target), { recursive: true });
      if (!fs.existsSync(target)) fs.writeFileSync(target, '');
    },

    deleteEntity(p, recursive) {
      const target = absolute(p);
      const stat = fs.lstatSync(target);
      if (stat.isDirectory()) {
        fs.rmSync(target, { recursive, force: false });
      } else {
        fs.unlinkSync(target);
      }
    },

    listDirectory(p, recursive): DirectoryEntry[] {
      const root = absolute(p);
      const entries: DirectoryEntry[] = [];
      const walk = (dir: string): void => {
        for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, item.name);
          const type = item.isSymbolicLink()
            ? EntityType.Link
            : item.isDirectory()
              ? EntityType.Directory
              : EntityType.File;
          entries.push({ path: full, type });
          if (recursive && item.isDirectory()) walk(full);
        }
      };
      walk(root);
      return entries;
    },

    rename(from, to) {
      fs.renameSync(absolute(from), absolute(to));
    },

    copyFile(from, to) {
      fs.copyFileSync(absolute(from), absolute(to));
    },

    currentDirectory: () => cwd,

    setCurrentDirectory(p) {
      cwd = absolute(p);
      setUriBase(directoryToUriBase(cwd));
    },

    systemTempDirectory: () => os.tmpdir(),

    createTempDirectory: (parent, prefix) =>
      fs.mkdtempSync(path.join(absolute(parent), prefix)),

    resolveSymbolicLinks: (p) => fs.realpathSync(absolute(p)),

    createLink(link, target) {
      fs.symlinkSync(target, absolute(link));
    },

    linkTarget: (link) => fs.readlinkSync(absolute(link)),
  };

  const spawnEnv = (options: RunOptions): NodeJS.ProcessEnv => ({
    ...(options.includeParentEnvironment ? env : {}),
    ...(options.environment ?? {}),
  });

  const processHost: ProcessHost = {
    async run(executable, args, runOptions): Promise<ProcessOutcome> {
      // Synchronous on purpose. gg awaits every process it starts, and
      // `spawnSync` keeps the ordering of gg's own output and the child's
      // output intact — with `spawn` the two interleave unpredictably.
      const result = spawnSync(executable, args, {
        cwd: absolute(runOptions.workingDirectory ?? cwd),
        env: spawnEnv(runOptions),
        shell: needsShell(executable, runOptions.runInShell),
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });

      if (result.error) {
        // gg reads the stderr of a failed command; a missing executable
        // has to look the same way rather than throwing across the bridge.
        return {
          exitCode: 127,
          stdout: '',
          stderr: String(result.error.message),
          pid: 0,
        };
      }

      return {
        // A child killed by a signal has no status. Shells report those
        // as 128 + signal; gg only cares that it is not zero.
        exitCode: result.status ?? 128,
        /* v8 ignore start — with `encoding: 'utf8'` and piped stdio these
           are always a string, a string and a number; the fallbacks are
           there for the day one of those options changes. */
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        pid: result.pid ?? 0,
        /* v8 ignore stop */
      };
    },

    async start(executable, args, runOptions): Promise<StartedProcess> {
      const child = spawn(executable, args, {
        cwd: absolute(runOptions.workingDirectory ?? cwd),
        env: spawnEnv(runOptions),
        shell: needsShell(executable, runOptions.runInShell),
        // Detached means »outlive gg«: `gg do code` opens the editor that
        // way and never reads anything back.
        detached: runOptions.detached,
        stdio: runOptions.detached ? 'ignore' : 'pipe',
      });
      if (runOptions.detached) child.unref();

      return new NodeStartedProcess(child, runOptions.detached);
    },
  };

  const platform: PlatformHost = {
    environmentEntries: () =>
      Object.entries(env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    operatingSystem: () => nodePlatformToDart(process.platform),
    pathSeparator: () => path.sep,
    setExitCode: (code) => {
      exitCode = code;
    },
    exitCode: () => exitCode,
  };

  const writeStdout =
    options.onStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr =
    options.onStderr ?? ((text: string) => process.stderr.write(text));

  const consoleHost: ConsoleHost = {
    writeStdout,
    writeStderr,
    readLine: () => readLineFrom(options.stdinFd),
    /* v8 ignore start — the »yes, a terminal« halves need a real tty,
       which a test runner never has. The e2e suite covers the other half
       by running the CLI with its output piped. */
    hasTerminal: () => Boolean(process.stdout.isTTY && process.stdin.isTTY),
    supportsAnsiEscapes: () =>
      Boolean(process.stdout.isTTY) && process.env.TERM !== 'dumb',
    terminalColumns: () => process.stdout.columns ?? 80,
    /* v8 ignore stop */
  };

  const prompts =
    options.prompts === false
      ? undefined
      : (options.prompts ??
        createNodePrompts({ write: writeStdout, input: options.stdin }));

  return {
    fs: fileSystem,
    process: processHost,
    platform,
    console: consoleHost,
    prompts,
  };
}

/**
 * Whether a command has to go through a shell.
 *
 * Node refuses to spawn a `.bat` or `.cmd` file without one — the fix for
 * CVE-2024-27980 — and throws `EINVAL` instead. gg reaches for those
 * wrappers on Windows (`pana.bat`, `flutter.bat`) without asking for a
 * shell, because a native Dart build does not need one. Deciding it here
 * keeps that knowledge in the host, where the platform is known, rather
 * than spreading a Node detail through the gg suite.
 * @param executable - The program gg wants to run.
 * @param requested - Whether gg asked for a shell itself.
 * @param platform - The platform to decide for. Defaults to this one;
 *   passing it makes both answers reachable from any host.
 * @returns Whether to hand the command to a shell.
 */
export function needsShell(
  executable: string,
  requested: boolean,
  platform: string = process.platform,
): boolean {
  if (requested) return true;
  if (platform !== 'win32') return false;
  return /\.(bat|cmd)$/i.test(executable);
}

/**
 * Maps Node's platform names onto the ones `Platform.operatingSystem` uses.
 * @param platform - What `process.platform` reports.
 * @returns The Dart spelling of the same operating system.
 */
export function nodePlatformToDart(platform: string): string {
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return platform;
  }
}

/**
 * Reads one line from a file descriptor, blocking until it arrives.
 *
 * gg's `dart:io` calls `stdin.readLineSync()`, which cannot wait for a
 * promise, so this reads the descriptor directly, one byte at a time —
 * reading ahead would swallow input a child process is meant to get.
 *
 * Returns `null` at end of input, which is what a closed or redirected
 * stdin gives and what makes gg's interactive commands report »no
 * terminal« instead of waiting for an answer nobody will type.
 * @param fd - The file descriptor to read from. Defaults to stdin.
 * @returns The line without its newline, or `null` at end of input.
 */
export function readLineFrom(fd: number = 0): string | null {
  const chunk = Buffer.alloc(1);
  let line = '';
  for (;;) {
    let read = 0;
    try {
      read = fs.readSync(fd, chunk, 0, 1, null);
    } catch (error) {
      /* v8 ignore start — EAGAIN only happens on a non-blocking tty, and
         a half-read line only if the descriptor dies mid-line. */
      if ((error as NodeJS.ErrnoException).code === 'EAGAIN') continue;
      return line.length > 0 ? line : null;
      /* v8 ignore stop */
    }
    if (read === 0) return line.length > 0 ? line : null;
    const char = chunk.toString('utf8');
    if (char === '\n') return line;
    if (char !== '\r') line += char;
  }
}

// #############################################################################
/**
 * A {@link StartedProcess} on top of a Node `ChildProcess`.
 *
 * Output is buffered from the moment the child is spawned. Dart attaches
 * its listeners one microtask later, and a fast program — `echo`, say —
 * can be done by then; without the buffer its output would be lost, and gg
 * would read an empty test run as a failure.
 */
export class NodeStartedProcess implements StartedProcess {
  /**
   * Wraps a spawned child.
   * @param child - The process `spawn` returned.
   * @param detached - Whether the child was started to outlive gg.
   */
  constructor(
    private readonly child: ChildProcess,
    detached: boolean,
  ) {
    if (detached) {
      // Nothing to read, and no exit to wait for.
      this.exitCode = 0;
      this.exited = true;
      return;
    }

    child.stdout?.on('data', (chunk: Buffer) => this.push('out', chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.push('err', chunk));

    const finish = (code: number): void => {
      if (this.exited) return;
      this.exited = true;
      this.exitCode = code;
      this.onExitListener?.(code);
    };
    /* v8 ignore next 3 — `close` always carries either a code or a signal;
       the last fallback is there so a future Node cannot make gg believe a
       killed process succeeded. */
    child.on('close', (code, signal) =>
      finish(code ?? (signal !== null ? 128 : 0)),
    );
    child.on('error', () => finish(127));
  }

  private outListener?: (chunk: Uint8Array) => void;
  private errListener?: (chunk: Uint8Array) => void;
  private onExitListener?: (code: number) => void;
  private readonly outBuffer: Uint8Array[] = [];
  private readonly errBuffer: Uint8Array[] = [];
  private exited = false;
  private exitCode = 0;

  /** The process id, or 0 when the spawn failed. */
  get pid(): number {
    /* v8 ignore next — a child that failed to spawn still reports its
       error through `onExit`, so this fallback is never reached in
       practice. */
    return this.child.pid ?? 0;
  }

  /**
   * Registers the stdout sink and replays whatever arrived before it.
   * @param listener - Receives each chunk.
   */
  onStdout(listener: (chunk: Uint8Array) => void): void {
    this.outListener = listener;
    this.drain(this.outBuffer, listener);
  }

  /**
   * Registers the stderr sink and replays whatever arrived before it.
   * @param listener - Receives each chunk.
   */
  onStderr(listener: (chunk: Uint8Array) => void): void {
    this.errListener = listener;
    this.drain(this.errBuffer, listener);
  }

  /**
   * Registers the exit callback, firing at once if the child already ended.
   * @param listener - Receives the exit code.
   */
  onExit(listener: (code: number) => void): void {
    this.onExitListener = listener;
    if (this.exited) listener(this.exitCode);
  }

  /**
   * Writes to the child's stdin.
   * @param text - What to write. No newline is appended.
   */
  writeStdin(text: string): void {
    this.child.stdin?.write(text);
  }

  /** Closes the child's stdin. */
  closeStdin(): void {
    this.child.stdin?.end();
  }

  /**
   * Sends a signal to the child.
   * @param signal - A signal name; anything unrecognised becomes SIGTERM.
   * @returns Whether the signal was delivered.
   */
  kill(signal: string): boolean {
    const name = signal.toUpperCase().replace('PROCESSSIGNAL.', '');
    const known = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP'];
    return this.child.kill(
      (known.includes(name) ? name : 'SIGTERM') as NodeJS.Signals,
    );
  }

  private push(stream: 'out' | 'err', chunk: Buffer): void {
    const bytes = new Uint8Array(chunk);
    const listener = stream === 'out' ? this.outListener : this.errListener;
    if (listener) {
      listener(bytes);
    } else {
      (stream === 'out' ? this.outBuffer : this.errBuffer).push(bytes);
    }
  }

  private drain(
    buffer: Uint8Array[],
    listener: (chunk: Uint8Array) => void,
  ): void {
    while (buffer.length > 0) listener(buffer.shift()!);
  }
}
