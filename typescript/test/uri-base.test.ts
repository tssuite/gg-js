// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { afterEach, describe, expect, test } from 'vitest';

import { directoryToUriBase } from '../host-node.js';
import { ensureUriBase, setUriBase } from '../uri-base.js';

/** The slot `Uri.base` reads. */
type LocationSlot = { location?: { href: string } };

describe('uri-base', () => {
  const original = (globalThis as LocationSlot).location;

  afterEach(() => {
    Object.defineProperty(globalThis, 'location', {
      value: original,
      writable: true,
      configurable: true,
    });
  });

  // ###########################################################################
  describe('directoryToUriBase(directory)', () => {
    test('turns a directory into a file: URL ending in a slash', () => {
      const href = directoryToUriBase('/tmp/work');

      expect(href.startsWith('file://')).toBe(true);
      expect(href.endsWith('/')).toBe(true);
    });

    test('does not double the trailing slash', () => {
      expect(directoryToUriBase('/tmp/work/')).toBe(
        directoryToUriBase('/tmp/work'),
      );
    });
  });

  // ###########################################################################
  describe('ensureUriBase()', () => {
    test('installs a placeholder when there is no location', () => {
      Object.defineProperty(globalThis, 'location', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      ensureUriBase();

      expect((globalThis as LocationSlot).location?.href).toBe('file:///');
    });

    test('leaves an existing location alone', () => {
      Object.defineProperty(globalThis, 'location', {
        value: { href: 'https://example.com/' },
        writable: true,
        configurable: true,
      });

      ensureUriBase();

      expect((globalThis as LocationSlot).location?.href).toBe(
        'https://example.com/',
      );
    });
  });

  // ###########################################################################
  describe('setUriBase(href)', () => {
    test('installs a location when there is none', () => {
      Object.defineProperty(globalThis, 'location', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      setUriBase(directoryToUriBase('/tmp/work'));

      expect((globalThis as LocationSlot).location?.href).toBe(
        directoryToUriBase('/tmp/work'),
      );
    });

    test('updates the one it installed earlier', () => {
      Object.defineProperty(globalThis, 'location', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      setUriBase(directoryToUriBase('/tmp/first'));
      setUriBase(directoryToUriBase('/tmp/second'));

      expect((globalThis as LocationSlot).location?.href).toBe(
        directoryToUriBase('/tmp/second'),
      );
    });

    test('leaves a read-only Location alone', () => {
      // What a browser has: assigning `href` navigates or throws, and
      // `Uri.base` is already right there.
      const readOnly = {
        get href(): string {
          return 'https://example.com/app/';
        },
        set href(_: string) {
          throw new Error('navigation is not allowed here');
        },
      };
      Object.defineProperty(globalThis, 'location', {
        value: readOnly,
        writable: true,
        configurable: true,
      });

      expect(() =>
        setUriBase(directoryToUriBase('/tmp/work')),
      ).not.toThrow();
      expect((globalThis as LocationSlot).location?.href).toBe(
        'https://example.com/app/',
      );
    });
  });
});
