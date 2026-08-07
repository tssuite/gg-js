// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// Node CLI example. Run with: `pnpm example:node`
// Requires a prior `pnpm build:dart`.

import { runBytesExample } from '../../typescript/examples/bytes.js';
import { runCallbackExample } from '../../typescript/examples/callback.js';
import { runClassExample } from '../../typescript/examples/class.js';
import { runFunctionExample } from '../../typescript/examples/function.js';
import { runJsonExample } from '../../typescript/examples/json.js';

console.log('— Example 1: function call —');
console.log(await runFunctionExample());

console.log('\n— Example 2: class with async methods —');
console.log(await runClassExample());

console.log('\n— Example 3: JSON exchange —');
console.log(await runJsonExample({ name: 'Alice', age: 30 }));

console.log('\n— Example 4: JS callback into Dart —');
console.log(await runCallbackExample());

console.log('\n— Example 5: byte array exchange —');
console.log(await runBytesExample(new Uint8Array([1, 2, 3, 4, 5])));
