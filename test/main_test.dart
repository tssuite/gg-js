// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Tests for the JS bridge in `lib/src/main.dart`.
//
// The bridge depends on `dart:js_interop` and `dart:js_interop_unsafe`, so
// it can only run in a JS-capable environment. The default `dart test` run
// on the VM skips this file via `@TestOn('browser')`. Execute it with:
//
//   dart test -p chrome test/main_test.dart
//
// The end-to-end behaviour is also exercised by the Vitest specs under
// `typescript/test/` (which run against the compiled JS/Wasm bundle in
// both Node and Chromium). This file complements those by unit-testing
// the bridge classes directly, without going through the build step.
@TestOn('browser')
library;

import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:gg_bridge_dart_typescript/src/main.dart';
import 'package:test/test.dart';

void main() {
  late DartBridge bridge;

  setUp(() {
    bridge = DartBridge();
  });

  group('example 1 — function call', () {
    test('add returns the sum', () {
      expect(bridge.add(2, 3), 5);
    });

    test('greet returns the greeting', () {
      expect(bridge.greet('world'), 'Hello, world!');
    });
  });

  group('example 2 — class with sync + async methods', () {
    test('createCounter returns a JS object with value and increment', () {
      final c = bridge.createCounter(10);
      expect((c.getProperty('value'.toJS) as JSNumber).toDartInt, 10);
      final newValue = (c.callMethod('increment'.toJS) as JSNumber).toDartInt;
      expect(newValue, 11);
    });

    test('increment respects the optional step', () {
      final c = bridge.createCounter();
      final v = (c.callMethod('increment'.toJS, 5.toJS) as JSNumber).toDartInt;
      expect(v, 5);
    });

    test('incrementAsync resolves to the new value', () async {
      final c = bridge.createCounter();
      final promise =
          c.callMethod('incrementAsync'.toJS, 5.toJS, 3.toJS)
              as JSPromise<JSNumber>;
      final result = await promise.toDart;
      expect(result.toDartInt, 3);
    });
  });

  group('example 3 — typed object exchange', () {
    test('marks age >= 18 as adult', () {
      final input = JSObject();
      input.setProperty('name'.toJS, 'Alice'.toJS);
      input.setProperty('age'.toJS, 30.toJS);

      final out = bridge.enrichPerson(input);

      expect((out.getProperty('name'.toJS) as JSString).toDart, 'Alice');
      expect((out.getProperty('age'.toJS) as JSNumber).toDartInt, 30);
      expect((out.getProperty('isAdult'.toJS) as JSBoolean).toDart, true);
    });

    test('marks age < 18 as not adult', () {
      final input = JSObject();
      input.setProperty('name'.toJS, 'Bob'.toJS);
      input.setProperty('age'.toJS, 12.toJS);

      final out = bridge.enrichPerson(input);

      expect((out.getProperty('isAdult'.toJS) as JSBoolean).toDart, false);
    });
  });

  group('example 4 — JS callback into Dart', () {
    test('invokes the callback for every item', () {
      final items = <String>[
        'foo',
        'bar',
        'baz',
      ].map((s) => s.toJS).toList().toJS;
      final callback = ((JSString s) => s.toDart.toUpperCase().toJS).toJS;

      final out = bridge.mapWithCallback(items, callback);

      expect(out.toDart.map((s) => s.toDart).toList(), <String>[
        'FOO',
        'BAR',
        'BAZ',
      ]);
    });
  });

  group('example 5 — byte array exchange', () {
    test('returns the byte count for a populated buffer', () {
      final bytes = Uint8List.fromList(<int>[1, 2, 3, 4, 5]).toJS;
      final out = bridge.analyzeBytes(bytes);
      expect((out.getProperty('byteCount'.toJS) as JSNumber).toDartInt, 5);
    });

    test('returns 0 for an empty buffer', () {
      final out = bridge.analyzeBytes(Uint8List(0).toJS);
      expect((out.getProperty('byteCount'.toJS) as JSNumber).toDartInt, 0);
    });
  });
}
