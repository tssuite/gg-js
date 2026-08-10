// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The file shuffling around the build, done in Dart rather than in the
// shell.
//
// `rm -rf`, `mkdir -p`, `cp` and `chmod` are not commands on Windows, and
// npm runs package scripts through `cmd.exe` there. Since the build
// already needs a Dart SDK, doing this here keeps one implementation for
// every platform instead of two that drift apart.
//
//   dart run scripts/dist.dart clean      before a build
//   dart run scripts/dist.dart finalize   after tsc and vite

import 'dart:io';

const _generated = 'typescript/generated';
const _dist = 'dist';

Future<void> main(List<String> args) async {
  final command = args.isEmpty ? '' : args.first;

  switch (command) {
    case 'clean':
      _clean();
    case 'finalize':
      _finalize();
    default:
      stderr.writeln('Usage: dart run scripts/dist.dart <clean|finalize>');
      exitCode = 2;
  }
}

// .............................................................................
/// Removes the previous build and prepares the generated folder.
void _clean() {
  for (final dir in [Directory(_dist), Directory(_generated)]) {
    if (dir.existsSync()) {
      dir.deleteSync(recursive: true);
    }
  }
  Directory(_generated).createSync(recursive: true);
  stdout.writeln('Cleaned $_dist and $_generated.');
}

// .............................................................................
/// Puts the pieces the bundler does not produce next to the bundle.
void _finalize() {
  _copy('$_generated/bridge-wasm.wasm', '$_dist/bridge-wasm.wasm');
  _copy('bin/gg-js.mjs', '$_dist/gg-js.mjs');
  _makeExecutable('$_dist/gg-js.mjs');
  stdout.writeln('Finalized $_dist.');
}

// .............................................................................
void _copy(String from, String to) {
  final source = File(from);
  if (!source.existsSync()) {
    stderr.writeln('Missing $from — run the build first.');
    exit(2);
  }
  Directory(File(to).parent.path).createSync(recursive: true);
  source.copySync(to);
}

// .............................................................................
/// Marks [path] executable where that is a thing.
///
/// Windows decides by extension and has no mode bits; npm generates its own
/// shim for the `bin` entry there anyway.
void _makeExecutable(String path) {
  if (Platform.isWindows) return;
  final result = Process.runSync('chmod', ['+x', path]);
  if (result.exitCode != 0) {
    stderr.writeln('Could not mark $path executable: ${result.stderr}');
    exit(result.exitCode);
  }
}
