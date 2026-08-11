// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Tests for the JS ⇄ Dart conversion in `lib/src/js_host.dart`.
//
// Like the bridge itself, this file needs `dart:js_interop` and therefore
// a JS runtime; a plain `dart test` run skips it. Run it with:
//
//   dart test -p chrome test/js_host_test.dart
//
// The conversion is exercised for real by `typescript/test/bridge.test.ts`,
// which hands the compiled module a host built out of a `Map` and watches
// gg find files that exist nowhere on disk. What this file adds is a
// direct look at the shapes, without a Wasm build in between.
@TestOn('browser')
library;

import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:gg/gg.dart';
import 'package:gg_js/src/js_host.dart';
import 'package:test/test.dart';

/// Builds a JS object out of `name: value` pairs.
JSObject _object(Map<String, JSAny?> members) {
  final object = JSObject();
  members.forEach((name, value) => object.setProperty(name.toJS, value));
  return object;
}

/// The JavaScript host object an embedder hands to `setHost`.
GgHostJs _hostJs({JSObject? fs}) =>
    _object({
          'fs': fs ?? _fsJs(),
          'process': _processJs(),
          'platform': _platformJs(),
          'console': _consoleJs(),
        })
        as GgHostJs;

JSObject _fsJs() => _object({
  'typeOf': ((JSString path, JSBoolean followLinks) => 1).toJS,
  'readBytes': ((JSString path) => Uint8List.fromList([1, 2, 3]).toJS).toJS,
  'writeBytes': ((JSString p, JSUint8Array b, JSBoolean a) {}).toJS,
  'createDirectory': ((JSString p, JSBoolean r) {}).toJS,
  'createFile': ((JSString p, JSBoolean r) {}).toJS,
  'deleteEntity': ((JSString p, JSBoolean r) {}).toJS,
  'listDirectory': ((JSString p, JSBoolean r) => <JSObject>[
    _object({'path': '/a/b'.toJS, 'type': 2.toJS}),
  ].toJS).toJS,
  'rename': ((JSString a, JSString b) {}).toJS,
  'copyFile': ((JSString a, JSString b) {}).toJS,
  'currentDirectory': (() => '/work').toJS,
  'setCurrentDirectory': ((JSString p) {}).toJS,
  'systemTempDirectory': (() => '/tmp').toJS,
  'createTempDirectory': ((JSString a, JSString b) => '/tmp/x').toJS,
  'resolveSymbolicLinks': ((JSString p) => p).toJS,
  'createLink': ((JSString a, JSString b) {}).toJS,
  'linkTarget': ((JSString l) => '/target').toJS,
});

JSObject _processJs() {
  JSPromise<JSObject> outcome(
    JSString executable,
    JSArray<JSString> args,
    JSObject options,
  ) => Future<JSObject>.value(
    _object({
      'exitCode': 0.toJS,
      'stdout': 'ran'.toJS,
      'stderr': ''.toJS,
      'pid': 7.toJS,
    }),
  ).toJS;

  return _object({'run': outcome.toJS, 'start': outcome.toJS});
}

JSObject _platformJs() => _object({
  'environmentEntries': (() => <JSArray<JSString>>[
    <JSString>['A'.toJS, '1'.toJS].toJS,
  ].toJS).toJS,
  'operatingSystem': (() => 'linux').toJS,
  'pathSeparator': (() => '/').toJS,
  'setExitCode': ((JSNumber c) {}).toJS,
  'exitCode': (() => 0).toJS,
});

JSObject _consoleJs() => _object({
  'writeStdout': ((JSString t) {}).toJS,
  'writeStderr': ((JSString t) {}).toJS,
  'readLine': (() => 'line').toJS,
  'hasTerminal': (() => false).toJS,
  'supportsAnsiEscapes': (() => false).toJS,
  'terminalColumns': (() => 80).toJS,
});

void main() {
  group('ggHostFromJs(callbacks)', () {
    test('builds a host out of the JavaScript object', () {
      final host = ggHostFromJs(_hostJs());

      expect(host.fileSystem.currentDirectory(), '/work');
      expect(host.fileSystem.typeOf('/a', true), GgEntityType.file);
      expect(host.fileSystem.readBytes('/a'), [1, 2, 3]);
      expect(host.fileSystem.systemTempDirectory(), '/tmp');
      expect(host.fileSystem.linkTarget('/l'), '/target');
    });

    test('maps a directory listing entry by entry', () {
      final listed = ggHostFromJs(
        _hostJs(),
      ).fileSystem.listDirectory('/a', false);

      expect(listed, hasLength(1));
      expect(listed.first.path, '/a/b');
      expect(listed.first.type, GgEntityType.directory);
    });

    test('turns the environment entries into a map', () {
      final host = ggHostFromJs(_hostJs());

      expect(host.platform.environment(), {'A': '1'});
      expect(host.platform.operatingSystem(), 'linux');
      expect(host.platform.pathSeparator(), '/');
    });

    test('awaits a process outcome', () async {
      final outcome = await ggHostFromJs(
        _hostJs(),
      ).process.run('git', ['status']);

      expect(outcome.exitCode, 0);
      expect(outcome.stdout, 'ran');
      expect(outcome.pid, 7);
    });

    test('leaves prompts unset when the host offers none', () {
      // Then gg refuses its interactive commands with an actionable
      // message rather than asking a question nobody can answer.
      expect(ggHostFromJs(_hostJs()).prompts, isNull);
    });

    test('reports a failing file system call as a FileSystemException', () {
      // gg catches `FileSystemException` in a dozen places; an opaque JS
      // error crossing the boundary would slip past all of them.
      final broken = _object({
        'typeOf': ((JSString p, JSBoolean f) => throw 'boom'.toJS).toJS,
      });

      expect(
        () => ggHostFromJs(_hostJs(fs: broken)).fileSystem.typeOf('/a', true),
        throwsA(anything),
      );
    });
  });
}
