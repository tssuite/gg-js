// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/// JavaScript bridge entry point.
///
/// `dart compile js` and `dart compile wasm` both run `main()` once when the
/// module is loaded. We attach a single object — `dartBridge` — to the
/// globalThis scope. The TypeScript wrapper picks it up from there.

// coverage:ignore-file

library;

import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'dart:typed_data';

import 'package:gg_bridge_dart_side/gg_bridge_dart_side.dart' as dart_api;

/// JS view of a `Person` object: `{ name: string, age: number }`.
extension type PersonJs._(JSObject _) implements JSObject {
  /// Create a JS `{ name, age }` object.
  external PersonJs({required String name, required int age});

  /// The person's name.
  external String get name;

  /// The person's age in years.
  external int get age;
}

// .............................................................................
// Extension types describing the JS-side object shapes used by example 3.
//
// They are zero-cost wrappers around `JSObject` — no runtime conversion,
// just typed access from Dart to fields of a plain JS object. The input
// shape, [PersonJs], lives in `person.dart`.

/// JS view of the enriched result: `{ name, age, isAdult }`.
extension type _EnrichedPersonJs._(JSObject _) implements JSObject {
  external _EnrichedPersonJs({
    required String name,
    required int age,
    required bool isAdult,
  });
}

/// JS view of the byte-analysis result: `{ byteCount: number }`.
extension type _ByteAnalysisJs._(JSObject _) implements JSObject {
  external _ByteAnalysisJs({required int byteCount});
}

// .............................................................................
// Public API exposed to JS

/// JS-facing wrapper around the Dart API. Marked with [JSExport] so
/// `createJSInteropWrapper` produces a JS object whose own methods delegate
/// to the Dart instance methods below.
@JSExport()
class DartBridge {
  /// Construct the bridge.
  DartBridge();

  // ----- example 1: simple function call -----

  /// Add two integers.
  int add(int a, int b) => _guard(() => dart_api.add(a, b));

  /// Greet a name.
  String greet(String name) => _guard(() => dart_api.greet(name));

  // ----- example 2: class with sync + async methods -----

  /// Create a new counter and return its JS wrapper.
  JSObject createCounter([int initial = 0]) {
    return _guard(
      () => createJSInteropWrapper(_JsCounter(dart_api.Counter(initial))),
    );
  }

  // ----- example 3: typed object exchange -----

  /// Accept a JS `{ name, age }` object, return `{ name, age, isAdult }`.
  ///
  /// No JSON serialization happens at the boundary — `JSObject` extension
  /// types give us typed access to the JS object's fields directly.
  JSObject enrichPerson(JSObject input) {
    return _guard(() {
      final p = input as PersonJs;
      final out = dart_api.enrichPerson(
        dart_api.Person(name: p.name, age: p.age),
      );
      return _EnrichedPersonJs(
        name: out.name,
        age: out.age,
        isAdult: out.isAdult,
      );
    });
  }

  // ----- example 4: JS callback passed into Dart -----

  /// Apply [callback] to each entry of [items] and return the results.
  ///
  /// [items] arrives as a JS array of strings; [callback] is a JS function.
  /// We convert both to their Dart counterparts and use the underlying
  /// `mapWithCallback` from `package:bridge_dart`.
  JSArray<JSString> mapWithCallback(
    JSArray<JSString> items,
    JSFunction callback,
  ) {
    return _guard(() {
      final dartItems = items.toDart.map<String>((j) => j.toDart).toList();
      final result = dart_api.mapWithCallback<String, String>(dartItems, (
        String s,
      ) {
        final ret = callback.callAsFunction(null, s.toJS);
        return (ret as JSString?)?.toDart ?? '';
      });
      return result.map<JSString>((s) => s.toJS).toList().toJS;
    });
  }

  // ----- example 5: byte array exchange -----

  /// Count the bytes in a JS `Uint8Array` and return `{ byteCount }`.
  ///
  /// The JS `Uint8Array` arrives as a [JSUint8Array]; `.toDart` exposes it
  /// as a [Uint8List] view over the same bytes — no copy at the boundary.
  JSObject analyzeBytes(JSUint8Array input) {
    return _guard(() {
      final out = dart_api.analyzeBytes(input.toDart);
      return _ByteAnalysisJs(byteCount: out.byteCount);
    });
  }
}

/// JS wrapper for [dart_api.Counter].
@JSExport()
class _JsCounter {
  _JsCounter(this._inner);
  final dart_api.Counter _inner;

  int get value => _inner.value;
  int increment([int by = 1]) => _inner.increment(by);
  JSPromise<JSNumber> incrementAsync(int delayMs, [int by = 1]) {
    return _inner.incrementAsync(delayMs, by).then((v) => v.toJS).toJS;
  }
}

// .............................................................................
// Error guard: convert Dart exceptions to JS-throwable errors with a
// readable message. Without this the JS side sees opaque interop objects.

T _guard<T>(T Function() body) {
  try {
    return body();
  } catch (e, st) {
    throw '$e\n$st'.toJS;
  }
}

// .............................................................................
// Bind to globalThis. The TypeScript wrapper reads `globalThis.dartBridge`
// after the module's `main()` has run.

void main() {
  final bridge = createJSInteropWrapper(DartBridge());
  globalContext.setProperty('dartBridge'.toJS, bridge);
}
