// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

import { createNodeHost } from '../host-node.js';
import {
  createNodePrompts,
  UnansweredPromptError,
} from '../prompts-node.js';

/**
 * Builds prompts that read from a scripted list of answers.
 * @param answers - What the user "types", in order. Runs out into `null`.
 * @returns The prompts and everything they wrote.
 */
function scripted(answers: string[]): {
  prompts: ReturnType<typeof createNodePrompts>;
  written: string[];
} {
  const written: string[] = [];
  const prompts = createNodePrompts({
    write: (text) => written.push(text),
    readLine: () => answers.shift() ?? null,
  });
  return { prompts, written };
}

describe('createNodePrompts()', () => {
  // ###########################################################################
  describe('select', () => {
    test('returns the index the user picked', () => {
      const { prompts, written } = scripted(['2']);

      const index = prompts.select('Pick one', ['alpha', 'beta', 'gamma'], 0);

      expect(index).toBe(1);
      expect(written.join('')).toContain('Pick one');
      expect(written.join('')).toContain('2) beta');
    });

    test('marks the initial choice and takes it on an empty answer', () => {
      const { prompts, written } = scripted(['']);

      const index = prompts.select('Pick', ['no', 'yes'], 1);

      expect(index).toBe(1);
      // The marker tells the user what return will give them.
      expect(written.join('')).toContain('> 2) yes');
      expect(written.join('')).toContain('[2]');
    });

    test('asks again after an answer that is not a choice', () => {
      const { prompts, written } = scripted(['nope', '17', '1']);

      expect(prompts.select('Pick', ['a', 'b'], 0)).toBe(0);
      expect(written.join('')).toContain('between 1 and 2');
    });

    test('falls back to the first choice for an out-of-range initial', () => {
      const { prompts } = scripted(['']);
      expect(prompts.select('Pick', ['a', 'b'], 99)).toBe(0);
    });

    test('refuses to guess when stdin ends', () => {
      const { prompts } = scripted([]);

      // Picking a default here would decide what gets published.
      expect(() => prompts.select('Pick', ['a', 'b'], 0)).toThrow(
        UnansweredPromptError,
      );
    });
  });

  // ###########################################################################
  describe('input', () => {
    test('returns what the user typed', () => {
      const { prompts, written } = scripted(['my message']);

      expect(prompts.input('Message', '', '', false)).toBe('my message');
      expect(written.join('')).toBe('Message: ');
    });

    test('keeps the suggested text on an empty answer', () => {
      const { prompts, written } = scripted(['']);

      expect(prompts.input('Message', '', 'suggested', false)).toBe(
        'suggested',
      );
      expect(written.join('')).toContain('[suggested]');
    });

    test('falls back to the default value when there is no initial text', () => {
      const { prompts } = scripted(['']);
      expect(prompts.input('Message', 'fallback', '', false)).toBe('fallback');
    });

    test('prefers the initial text over the default value', () => {
      const { prompts } = scripted(['']);
      expect(prompts.input('Message', 'default', 'initial', false)).toBe(
        'initial',
      );
    });

    test('refuses to guess when stdin ends', () => {
      const { prompts } = scripted([]);
      expect(() => prompts.input('Message', 'x', '', false)).toThrow(
        /stdin ended/,
      );
    });
  });

  // ###########################################################################
  describe('defaults', () => {
    test('reads the answer from a descriptor and writes the question out', () => {
      // No `write` and no `readLine`: the question goes to the real
      // stdout and the answer comes off the descriptor, which is what a
      // user at a terminal gets.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-prompt-'));
      const file = path.join(tmp, 'answers.txt');
      fs.writeFileSync(file, '2\n');
      const fd = fs.openSync(file, 'r');

      try {
        const prompts = createNodePrompts({ stdinFd: fd });
        expect(prompts.select('Pick', ['a', 'b'], 0)).toBe(1);
      } finally {
        fs.closeSync(fd);
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  // ###########################################################################
  describe('as part of the Node host', () => {
    test('is supplied by default', () => {
      expect(createNodeHost().prompts).toBeDefined();
    });

    test('can be switched off', () => {
      // Then gg refuses its interactive commands with an actionable
      // message instead of asking a question nobody is there to answer.
      expect(createNodeHost({ prompts: false }).prompts).toBeUndefined();
    });

    test('can be replaced', () => {
      const { prompts } = scripted(['1']);
      expect(createNodeHost({ prompts }).prompts).toBe(prompts);
    });

    test('reads its answers from the host\'s stdin descriptor', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-prompt-host-'));
      const file = path.join(tmp, 'answers.txt');
      fs.writeFileSync(file, 'from the host\n');
      const fd = fs.openSync(file, 'r');
      const written: string[] = [];

      try {
        const host = createNodeHost({
          stdinFd: fd,
          onStdout: (text) => written.push(text),
        });

        expect(host.prompts!.input('Message', '', '', false)).toBe(
          'from the host',
        );
        // The question goes through the host console, so an embedder that
        // captures gg's output captures the prompt with it.
        expect(written.join('')).toContain('Message');
      } finally {
        fs.closeSync(fd);
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
