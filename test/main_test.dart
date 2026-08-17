// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Tests for the JS bridge in `lib/src/main.dart`.
//
// The bridge depends on `dart:js_interop`, which does not exist on the
// Dart VM, so a plain `dart test` run skips this file through the
// `@TestOn` below. Run it with:
//
//   dart test -p chrome test/main_test.dart
//
// What the bridge actually does for gg is covered end to end by the
// Vitest specs under `typescript/`: `bridge.test.ts` drives it in process
// against a real Wasm module, and `e2e/cli.e2e.test.ts` spawns the built
// binary. This file only pins the shape of the object the module
// publishes — the part those specs take for granted.
@TestOn('browser')
library;

import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:ggwsm/src/main.dart';
import 'package:test/test.dart';

void main() {
  group('main()', () {
    test('publishes the bridge as globalThis.ggBridge', () {
      main();

      final bridge = globalContext.getProperty<JSObject?>('ggBridge'.toJS);
      expect(bridge, isNotNull);
    });
  });

  group('GgBridge', () {
    test('reports the version of the gg it carries', () {
      expect(GgBridge().version, matches(r'^\d+\.\d+\.\d+'));
    });

    test('refuses to run before a host is installed', () {
      final bridge = GgBridge()..clearHost();

      // Without a host gg has no file system, no processes and no
      // console; letting it start would fail on the first file it touched.
      expect(() => bridge.run(<JSString>[].toJS), throwsA(anything));
    });
  });
}
