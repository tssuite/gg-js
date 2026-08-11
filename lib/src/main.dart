// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

/// The JavaScript entry point of `@tssuite/gg-js`.
///
/// `dart compile wasm` runs `main()` once when the module is loaded, which
/// publishes a single object — `globalThis.ggBridge` — for the TypeScript
/// wrapper to pick up. The bridge has exactly two jobs:
///
/// 1. [GgBridge.setHost] takes the JavaScript callbacks that give gg a file
///    system, a way to start processes, a platform and a console, and
///    installs them as gg's `GgHost`.
/// 2. [GgBridge.run] takes a command line and runs gg with it.
///
/// Everything else is conversion at the boundary.
library;

// coverage:ignore-file

import 'dart:async';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:gg/gg.dart';

import 'js_host.dart';

// .............................................................................
/// The object published as `globalThis.ggBridge`.
@JSExport()
class GgBridge {
  /// Constructs the bridge.
  GgBridge();

  /// The version of the `gg` command line compiled into this module.
  String get version => ggVersion;

  /// Installs the host [callbacks] gg runs on.
  ///
  /// Must be called before [run]. Calling it again replaces the host.
  void setHost(JSObject callbacks) =>
      _guard(() => GgHost.install(ggHostFromJs(callbacks as GgHostJs)));

  /// Removes the installed host. Mostly useful in tests.
  void clearHost() => _guard(GgHost.uninstall);

  /// Runs `gg` with [args] and resolves with the exit code.
  ///
  /// Never rejects on a gg error — gg reports those on the console and
  /// through the exit code, exactly as the native executable does. The
  /// promise only rejects when the bridge itself is used wrongly, e.g. when
  /// no host was installed.
  JSPromise<JSNumber> run(JSArray<JSString> args) {
    final host = GgHost.installed;
    if (host == null) {
      throw 'gg-js: call setHost(...) before run(...).'.toJS;
    }

    final parsed = args.toDart.map((a) => a.toDart).toList();
    return _run(parsed, host).then((code) => code.toJS).toJS;
  }
}

// .............................................................................
/// Runs gg and makes sure everything it prints reaches the host console.
///
/// `print` inside a Wasm module goes straight to the JavaScript console and
/// would bypass the host's stdout — and with it any redirection the embedder
/// set up. The zone below catches it and routes it the same way `ggLog`
/// output goes.
Future<int> _run(List<String> args, GgHost host) {
  void write(String line) => host.console.writeStdout('$line\n');

  return runZoned(
    () => runGg(args: args, ggLog: write),
    zoneSpecification: ZoneSpecification(
      print: (self, parent, zone, line) => write(line),
    ),
  );
}

// .............................................................................
T _guard<T>(T Function() body) {
  try {
    return body();
  } catch (e, stackTrace) {
    throw '$e\n$stackTrace'.toJS;
  }
}

// .............................................................................
/// Publishes the bridge. Called once when the Wasm module is loaded.
void main() {
  globalContext.setProperty(
    'ggBridge'.toJS,
    createJSInteropWrapper(GgBridge()),
  );
}
