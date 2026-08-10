// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/// Turns the JavaScript host object handed to `ggBridge.setHost(...)` into
/// the `GgHost` the gg suite expects.
///
/// The extension types below describe the shape the TypeScript side
/// promises; `typescript/host.ts` declares the same shape for its readers.
/// Everything is a zero-cost view onto a plain JS object — no serialization
/// happens at the boundary except for the byte arrays, which are shared.
library;

// coverage:ignore-file

import 'dart:io';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:gg/gg.dart';

// #############################################################################
// The JavaScript shapes

/// `{ fs, process, platform, console, prompts? }`
extension type GgHostJs._(JSObject _) implements JSObject {
  /// File system callbacks.
  external GgFsJs get fs;

  /// Process callbacks.
  external GgProcessJs get process;

  /// Platform callbacks.
  external GgPlatformJs get platform;

  /// Console callbacks.
  external GgConsoleJs get console;

  /// Optional interactive prompt callbacks.
  external GgPromptsJs? get prompts;
}

/// The file system half of the host.
extension type GgFsJs._(JSObject _) implements JSObject {
  /// `0` not found, `1` file, `2` directory, `3` link.
  external int typeOf(String path, bool followLinks);

  /// Reads the whole file.
  external JSUint8Array readBytes(String path);

  /// Writes (or appends to) a file.
  external void writeBytes(String path, JSUint8Array bytes, bool append);

  /// Creates a directory.
  external void createDirectory(String path, bool recursive);

  /// Creates an empty file.
  external void createFile(String path, bool recursive);

  /// Deletes a file, directory or link.
  external void deleteEntity(String path, bool recursive);

  /// Lists a directory as `[{ path, type }]`.
  external JSArray<GgEntryJs> listDirectory(String path, bool recursive);

  /// Moves an entity.
  external void rename(String from, String to);

  /// Copies a file.
  external void copyFile(String from, String to);

  /// The working directory.
  external String currentDirectory();

  /// Changes the working directory.
  external void setCurrentDirectory(String path);

  /// The directory for temporary files.
  external String systemTempDirectory();

  /// Creates a uniquely named directory and returns its path.
  external String createTempDirectory(String parent, String prefix);

  /// Resolves all symbolic links in a path.
  external String resolveSymbolicLinks(String path);

  /// Creates a symbolic link.
  external void createLink(String link, String target);

  /// Reads what a symbolic link points to.
  external String linkTarget(String link);
}

/// One entry of a directory listing: `{ path, type }`.
extension type GgEntryJs._(JSObject _) implements JSObject {
  /// The absolute path.
  external String get path;

  /// `1` file, `2` directory, `3` link.
  external int get type;
}

/// The process half of the host.
extension type GgProcessJs._(JSObject _) implements JSObject {
  /// Runs a program to completion.
  external JSPromise<GgOutcomeJs> run(
    String executable,
    JSArray<JSString> arguments,
    GgRunOptionsJs options,
  );

  /// Starts a program and hands it over while it runs.
  external JSPromise<GgStartedJs> start(
    String executable,
    JSArray<JSString> arguments,
    GgRunOptionsJs options,
  );
}

/// A program that was started and is still running.
extension type GgStartedJs._(JSObject _) implements JSObject {
  /// The process id, or `0`.
  external int get pid;

  /// Registers the stdout sink.
  external void onStdout(JSFunction listener);

  /// Registers the stderr sink.
  external void onStderr(JSFunction listener);

  /// Registers the exit callback.
  external void onExit(JSFunction listener);

  /// Writes to the program's stdin.
  external void writeStdin(String text);

  /// Closes the program's stdin.
  external void closeStdin();

  /// Sends a signal to the program.
  external bool kill(String signal);
}

/// `{ workingDirectory, environment, includeParentEnvironment, runInShell,
/// detached }`
extension type GgRunOptionsJs._(JSObject _) implements JSObject {
  /// Builds the options object.
  external factory GgRunOptionsJs({
    String? workingDirectory,
    JSObject? environment,
    bool includeParentEnvironment,
    bool runInShell,
    bool detached,
  });
}

/// `{ exitCode, stdout, stderr, pid }`
extension type GgOutcomeJs._(JSObject _) implements JSObject {
  /// The exit code.
  external int get exitCode;

  /// Everything the program wrote to stdout.
  external String get stdout;

  /// Everything the program wrote to stderr.
  external String get stderr;

  /// The process id, or `0`.
  external int? get pid;
}

/// The platform half of the host.
extension type GgPlatformJs._(JSObject _) implements JSObject {
  /// The environment as `[[name, value], …]`.
  external JSArray<JSArray<JSString>> environmentEntries();

  /// `macos`, `linux`, `windows`, …
  external String operatingSystem();

  /// `/` or `\`.
  external String pathSeparator();

  /// Records the exit code.
  external void setExitCode(int code);

  /// The exit code recorded so far.
  external int exitCode();
}

/// The console half of the host.
extension type GgConsoleJs._(JSObject _) implements JSObject {
  /// Writes to stdout without appending a newline.
  external void writeStdout(String text);

  /// Writes to stderr without appending a newline.
  external void writeStderr(String text);

  /// Reads one line from stdin, `null` at end of input.
  external JSString? readLine();

  /// Whether a terminal is attached.
  external bool hasTerminal();

  /// Whether the terminal understands ANSI escapes.
  external bool supportsAnsiEscapes();

  /// The width of the terminal.
  external int terminalColumns();
}

/// The optional interactive prompts of the host.
extension type GgPromptsJs._(JSObject _) implements JSObject {
  /// Lets the user pick one of `options` and returns the index.
  external JSPromise<JSNumber> select(
    String prompt,
    JSArray<JSString> options,
    int initialIndex,
  );

  /// Lets the user edit a line of text.
  external JSPromise<JSString> input(
    String prompt,
    String defaultValue,
    String initialText,
    bool asMessageEditor,
  );
}

// #############################################################################
// The conversion

/// Builds the [GgHost] gg runs on from the JavaScript [callbacks].
GgHost ggHostFromJs(GgHostJs callbacks) {
  final prompts = callbacks.prompts;

  return GgHost(
    fileSystem: _fileSystem(callbacks.fs),
    process: _process(callbacks.process),
    platform: _platform(callbacks.platform),
    console: _console(callbacks.console),
    prompts: prompts == null ? null : _prompts(prompts),
  );
}

// .............................................................................
GgFileSystemCallbacks _fileSystem(GgFsJs fs) => GgFileSystemCallbacks(
  typeOf: (path, followLinks) =>
      _entityType(_fsGuard(path, () => fs.typeOf(path, followLinks))),
  readBytes: (path) => _fsGuard(path, () => fs.readBytes(path).toDart),
  writeBytes: (path, bytes, append) =>
      _fsGuard(path, () => fs.writeBytes(path, bytes.toJS, append)),
  createDirectory: (path, recursive) =>
      _fsGuard(path, () => fs.createDirectory(path, recursive)),
  createFile: (path, recursive) =>
      _fsGuard(path, () => fs.createFile(path, recursive)),
  deleteEntity: (path, recursive) =>
      _fsGuard(path, () => fs.deleteEntity(path, recursive)),
  listDirectory: (path, recursive) => _fsGuard(
    path,
    () => fs
        .listDirectory(path, recursive)
        .toDart
        .map((e) => GgDirectoryEntry(path: e.path, type: _entityType(e.type)))
        .toList(),
  ),
  rename: (from, to) => _fsGuard(from, () => fs.rename(from, to)),
  copyFile: (from, to) => _fsGuard(from, () => fs.copyFile(from, to)),
  currentDirectory: () => _fsGuard('.', () => fs.currentDirectory()),
  setCurrentDirectory: (path) =>
      _fsGuard(path, () => fs.setCurrentDirectory(path)),
  systemTempDirectory: () => _fsGuard('.', () => fs.systemTempDirectory()),
  createTempDirectory: (parent, prefix) =>
      _fsGuard(parent, () => fs.createTempDirectory(parent, prefix)),
  resolveSymbolicLinks: (path) =>
      _fsGuard(path, () => fs.resolveSymbolicLinks(path)),
  createLink: (link, target) =>
      _fsGuard(link, () => fs.createLink(link, target)),
  linkTarget: (link) => _fsGuard(link, () => fs.linkTarget(link)),
);

// .............................................................................
GgProcessCallbacks _process(GgProcessJs process) => GgProcessCallbacks(
  run:
      (
        executable,
        arguments, {
        workingDirectory,
        environment,
        includeParentEnvironment = true,
        runInShell = false,
      }) async => _outcome(
        await process
            .run(
              executable,
              _stringArray(arguments),
              GgRunOptionsJs(
                workingDirectory: workingDirectory,
                environment: _environment(environment),
                includeParentEnvironment: includeParentEnvironment,
                runInShell: runInShell,
                detached: false,
              ),
            )
            .toDart,
      ),
  start:
      (
        executable,
        arguments, {
        workingDirectory,
        environment,
        includeParentEnvironment = true,
        runInShell = false,
        detached = false,
      }) async => _JsStartedProcess(
        await process
            .start(
              executable,
              _stringArray(arguments),
              GgRunOptionsJs(
                workingDirectory: workingDirectory,
                environment: _environment(environment),
                includeParentEnvironment: includeParentEnvironment,
                runInShell: runInShell,
                detached: detached,
              ),
            )
            .toDart,
      ),
);

// #############################################################################
/// A [GgStartedProcess] backed by the JavaScript handle the host returned.
class _JsStartedProcess implements GgStartedProcess {
  _JsStartedProcess(this._js);

  final GgStartedJs _js;

  @override
  int get pid => _js.pid;

  @override
  void onStdout(void Function(Uint8List chunk) listener) =>
      _js.onStdout(((JSUint8Array chunk) => listener(chunk.toDart)).toJS);

  @override
  void onStderr(void Function(Uint8List chunk) listener) =>
      _js.onStderr(((JSUint8Array chunk) => listener(chunk.toDart)).toJS);

  @override
  void onExit(void Function(int code) listener) =>
      _js.onExit(((JSNumber code) => listener(code.toDartInt)).toJS);

  @override
  void writeStdin(String text) => _js.writeStdin(text);

  @override
  void closeStdin() => _js.closeStdin();

  @override
  bool kill(String signal) => _js.kill(signal);
}

// .............................................................................
GgPlatformCallbacks _platform(GgPlatformJs platform) => GgPlatformCallbacks(
  environment: () => <String, String>{
    for (final entry in platform.environmentEntries().toDart)
      entry.toDart[0].toDart: entry.toDart[1].toDart,
  },
  operatingSystem: () => platform.operatingSystem(),
  pathSeparator: () => platform.pathSeparator(),
  setExitCode: (code) => platform.setExitCode(code),
  exitCode: () => platform.exitCode(),
);

// .............................................................................
GgConsoleCallbacks _console(GgConsoleJs console) => GgConsoleCallbacks(
  writeStdout: (text) => console.writeStdout(text),
  writeStderr: (text) => console.writeStderr(text),
  readLine: () => console.readLine()?.toDart,
  hasTerminal: () => console.hasTerminal(),
  supportsAnsiEscapes: () => console.supportsAnsiEscapes(),
  terminalColumns: () => console.terminalColumns(),
);

// .............................................................................
GgPromptCallbacks _prompts(GgPromptsJs prompts) => GgPromptCallbacks(
  select: (prompt, options, initialIndex) async =>
      (await prompts
              .select(prompt, _stringArray(options), initialIndex)
              .toDart)
          .toDartInt,
  input: (prompt, defaultValue, initialText, asMessageEditor) async =>
      (await prompts
              .input(prompt, defaultValue, initialText, asMessageEditor)
              .toDart)
          .toDart,
);

// #############################################################################
// Small conversions

JSArray<JSString> _stringArray(List<String> values) =>
    values.map((v) => v.toJS).toList().toJS;

JSObject? _environment(Map<String, String>? environment) {
  if (environment == null) return null;
  final object = JSObject();
  environment.forEach((key, value) => object.setProperty(key.toJS, value.toJS));
  return object;
}

GgProcessOutcome _outcome(GgOutcomeJs outcome) => GgProcessOutcome(
  exitCode: outcome.exitCode,
  stdout: outcome.stdout,
  stderr: outcome.stderr,
  pid: outcome.pid ?? 0,
);

GgEntityType _entityType(int type) => switch (type) {
  1 => GgEntityType.file,
  2 => GgEntityType.directory,
  3 => GgEntityType.link,
  _ => GgEntityType.notFound,
};

/// Turns a JavaScript error into the [FileSystemException] the gg suite
/// expects from `dart:io`.
///
/// Without this a failing `fs.readFileSync` would surface as an opaque JS
/// object, and the `on FileSystemException` handlers scattered through gg
/// would not catch it.
T _fsGuard<T>(String path, T Function() body) {
  try {
    return body();
  } catch (e) {
    throw FileSystemException('$e', path);
  }
}
