// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The host contract: everything gg needs from the world around it.
//
// gg compiled to WebAssembly has no file system, no way to start a process
// and no terminal — `dart compile wasm` emits a `dart:io` whose members all
// throw. A host closes that gap. `createNodeHost()` in `host-node.ts` is the
// one this package ships; anything else that implements `GgHost` works too,
// including an in-memory one for tests.
//
// Every file system callback is **synchronous**. gg uses `dart:io`'s `…Sync`
// APIs throughout and cannot wait for a promise in the middle of them.

/** What a path points to. */
export const enum EntityType {
  /** Nothing exists at the path. */
  NotFound = 0,
  /** A regular file. */
  File = 1,
  /** A directory. */
  Directory = 2,
  /** A symbolic link. */
  Link = 3,
}

/** One entry of a directory listing. */
export interface DirectoryEntry {
  /** The absolute path of the entry. */
  path: string;
  /** What the entry is. */
  type: EntityType;
}

/** Options a process is started with. */
export interface RunOptions {
  /** The directory to run in. Defaults to the current one. */
  workingDirectory?: string;
  /** Extra environment variables. */
  environment?: Record<string, string>;
  /** Whether the parent environment is inherited. Defaults to true. */
  includeParentEnvironment: boolean;
  /** Whether the command goes through a shell. */
  runInShell: boolean;
  /** Whether gg wants the process detached (fire and forget). */
  detached: boolean;
}

/** What a finished process left behind. */
export interface ProcessOutcome {
  /** The exit code. */
  exitCode: number;
  /** Everything written to stdout. */
  stdout: string;
  /** Everything written to stderr. */
  stderr: string;
  /** The process id, or 0 when unknown. */
  pid?: number;
}

/** Reading and writing files on gg's behalf. All calls are synchronous. */
export interface FileSystemHost {
  /** Returns what `path` points to. */
  typeOf(path: string, followLinks: boolean): EntityType;
  /** Reads a whole file. */
  readBytes(path: string): Uint8Array;
  /** Writes a file, appending instead of truncating when `append`. */
  writeBytes(path: string, bytes: Uint8Array, append: boolean): void;
  /** Creates a directory, including parents when `recursive`. */
  createDirectory(path: string, recursive: boolean): void;
  /** Creates an empty file; does nothing when it already exists. */
  createFile(path: string, recursive: boolean): void;
  /** Deletes a file, directory or link. */
  deleteEntity(path: string, recursive: boolean): void;
  /** Lists a directory. */
  listDirectory(path: string, recursive: boolean): DirectoryEntry[];
  /** Moves a file or directory. */
  rename(from: string, to: string): void;
  /** Copies a file. */
  copyFile(from: string, to: string): void;
  /** The working directory. */
  currentDirectory(): string;
  /** Changes the working directory. */
  setCurrentDirectory(path: string): void;
  /** The directory for temporary files. */
  systemTempDirectory(): string;
  /** Creates a uniquely named directory below `parent`. */
  createTempDirectory(parent: string, prefix: string): string;
  /** Resolves every symbolic link in a path. */
  resolveSymbolicLinks(path: string): string;
  /** Creates a symbolic link. */
  createLink(link: string, target: string): void;
  /** Reads what a symbolic link points to. */
  linkTarget(link: string): string;
}

/**
 * A program that was started and is still running.
 *
 * The `on…` methods are called once, immediately after the process was
 * started. An implementation that produces output before then must hold on
 * to it until its listener arrives — nothing gg reads may be dropped.
 */
export interface StartedProcess {
  /** The process id, or 0 when the host does not report one. */
  readonly pid: number;
  /** Registers the sink for everything the program writes to stdout. */
  onStdout(listener: (chunk: Uint8Array) => void): void;
  /** Registers the sink for everything the program writes to stderr. */
  onStderr(listener: (chunk: Uint8Array) => void): void;
  /** Registers the callback for when the program terminates. Called once. */
  onExit(listener: (code: number) => void): void;
  /** Writes to the program's stdin. No newline is appended. */
  writeStdin(text: string): void;
  /** Closes the program's stdin. */
  closeStdin(): void;
  /** Sends a signal to the program. Returns whether it was delivered. */
  kill(signal: string): boolean;
}

/** Running the command line tools gg drives — git, gh, pub, npm, … */
export interface ProcessHost {
  /** Runs a program and resolves when it has finished. */
  run(
    executable: string,
    args: string[],
    options: RunOptions,
  ): Promise<ProcessOutcome>;
  /**
   * Starts a program and hands it over while it runs.
   *
   * gg needs the output as it arrives, not afterwards: `can commit` parses
   * `dart test`'s progress line by line, and `do publish` types the
   * confirmation into the started program's stdin. With
   * `options.detached` gg wants the process to outlive it and never reads
   * anything back.
   */
  start(
    executable: string,
    args: string[],
    options: RunOptions,
  ): Promise<StartedProcess>;
}

/** What gg needs to know about the machine and the process. */
export interface PlatformHost {
  /** The environment as `[[name, value], …]`. */
  environmentEntries(): [string, string][];
  /** `macos`, `linux`, `windows`, … */
  operatingSystem(): string;
  /** `/` or `\` */
  pathSeparator(): string;
  /** Records the exit code gg wants to terminate with. */
  setExitCode(code: number): void;
  /** The exit code recorded so far. */
  exitCode(): number;
}

/** gg's terminal. */
export interface ConsoleHost {
  /** Writes to stdout. No newline is appended. */
  writeStdout(text: string): void;
  /** Writes to stderr. No newline is appended. */
  writeStderr(text: string): void;
  /** Reads one line from stdin, `null` at end of input. */
  readLine(): string | null;
  /** Whether a terminal is attached. */
  hasTerminal(): boolean;
  /** Whether the terminal understands ANSI escape sequences. */
  supportsAnsiEscapes(): boolean;
  /** The width of the terminal in characters. */
  terminalColumns(): number;
}

/**
 * The interactive prompts.
 *
 * Optional: without them gg refuses its interactive commands with a message
 * naming the flag to pass instead, rather than hanging on input nobody can
 * give. The prompts of a native gg are drawn by `package:interact`, which
 * needs `dart:ffi` and is therefore absent from a Wasm build.
 *
 * Unlike {@link FileSystemHost}, these are asynchronous: gg awaits every
 * prompt, so a host is free to use whatever its platform offers for
 * reading a line — `readline` under Node, which works on Windows too, or
 * a dialog somewhere else.
 */
export interface PromptHost {
  /** Lets the user pick one of `options` and returns the index picked. */
  select(
    prompt: string,
    options: string[],
    initialIndex: number,
  ): Promise<number>;
  /** Lets the user edit a line of text. */
  input(
    prompt: string,
    defaultValue: string,
    initialText: string,
    asMessageEditor: boolean,
  ): Promise<string>;
}

/** Everything gg needs from the world around it. */
export interface GgHost {
  /** Reading and writing files. */
  fs: FileSystemHost;
  /** Running other programs. */
  process: ProcessHost;
  /** The machine and the process. */
  platform: PlatformHost;
  /** The terminal. */
  console: ConsoleHost;
  /** Interactive prompts, if this host can ask the user anything. */
  prompts?: PromptHost;
}
