// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Reads the `version:` line from pubspec.yaml and writes it into
// package.json. pubspec.yaml is the source of truth.
//
// Run via:  dart run scripts/sync_version.dart
//
// Kept minimal-dependency on purpose — only dart:io + dart:convert.

import 'dart:convert';
import 'dart:io';

Future<void> main() async {
  final pubspec = await File('pubspec.yaml').readAsString();
  final match = RegExp(
    r'^version:\s*(\S+)',
    multiLine: true,
  ).firstMatch(pubspec);
  if (match == null) {
    stderr.writeln('Could not find version: line in pubspec.yaml');
    exit(2);
  }
  final version = match.group(1)!;

  final pkgFile = File('package.json');
  final pkgRaw = await pkgFile.readAsString();
  final pkg = json.decode(pkgRaw) as Map<String, dynamic>;

  if (pkg['version'] == version) {
    stdout.writeln('package.json already at version $version — nothing to do.');
    return;
  }

  pkg['version'] = version;
  const encoder = JsonEncoder.withIndent('  ');
  await pkgFile.writeAsString('${encoder.convert(pkg)}\n');
  stdout.writeln(
    'Synced package.json to version $version (from pubspec.yaml).',
  );
}
