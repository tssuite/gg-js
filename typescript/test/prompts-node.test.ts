// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { Readable } from 'node:stream';
import { describe, expect, test } from 'vitest';

import { createNodeHost } from '../host-node.js';
import {
  askOnTerminal,
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
  asked: string[];
} {
  const written: string[] = [];
  const asked: string[] = [];
  const prompts = createNodePrompts({
    write: (text) => written.push(text),
    ask: async (prompt) => {
      asked.push(prompt);
      return answers.shift() ?? null;
    },
  });
  return { prompts, written, asked };
}

describe('createNodePrompts()', () => {
  // ###########################################################################
  describe('select', () => {
    test('returns the index the user picked', async () => {
      const { prompts, written } = scripted(['2']);

      const index = await prompts.select('Pick one', ['alpha', 'beta', 'gamma'], 0);

      expect(index).toBe(1);
      expect(written.join('')).toContain('Pick one');
      expect(written.join('')).toContain('2) beta');
    });

    test('marks the initial choice and takes it on an empty answer', async () => {
      const { prompts, written, asked } = scripted(['']);

      const index = await prompts.select('Pick', ['no', 'yes'], 1);

      expect(index).toBe(1);
      // The marker tells the user what return will give them.
      expect(written.join('')).toContain('> 2) yes');
      expect(asked.join('')).toContain('[2]');
    });

    test('asks again after an answer that is not a choice', async () => {
      const { prompts, written } = scripted(['nope', '17', '1']);

      expect(await prompts.select('Pick', ['a', 'b'], 0)).toBe(0);
      expect(written.join('')).toContain('between 1 and 2');
    });

    test('falls back to the first choice for an out-of-range initial', async () => {
      const { prompts } = scripted(['']);
      expect(await prompts.select('Pick', ['a', 'b'], 99)).toBe(0);
    });

    test('refuses to guess when stdin ends', async () => {
      const { prompts } = scripted([]);

      // Picking a default here would decide what gets published.
      await expect(prompts.select('Pick', ['a', 'b'], 0)).rejects.toThrow(
        UnansweredPromptError,
      );
    });
  });

  // ###########################################################################
  describe('input', () => {
    test('returns what the user typed', async () => {
      const { prompts, asked } = scripted(['my message']);

      expect(await prompts.input('Message', '', '', false)).toBe('my message');
      // readline owns the prompt — it needs the prompt's width to place
      // the cursor, so the caller must not write it separately.
      expect(asked).toEqual(['Message: ']);
    });

    test('keeps the suggested text on an empty answer', async () => {
      const { prompts, asked } = scripted(['']);

      expect(await prompts.input('Message', '', 'suggested', false)).toBe(
        'suggested',
      );
      expect(asked.join('')).toContain('[suggested]');
    });

    test('falls back to the default value when there is no initial text', async () => {
      const { prompts } = scripted(['']);
      expect(await prompts.input('Message', 'fallback', '', false)).toBe(
        'fallback',
      );
    });

    test('prefers the initial text over the default value', async () => {
      const { prompts } = scripted(['']);
      expect(await prompts.input('Message', 'default', 'initial', false)).toBe(
        'initial',
      );
    });

    test('refuses to guess when stdin ends', async () => {
      const { prompts } = scripted([]);
      await expect(prompts.input('Message', 'x', '', false)).rejects.toThrow(
        /stdin ended/,
      );
    });
  });

  // ###########################################################################
  describe('defaults', () => {
    test('reads a line off the input stream', async () => {
      // No `ask`: the answer comes through readline, which is the path a
      // user at a terminal takes.
      const written: string[] = [];
      const prompts = createNodePrompts({
        write: (text) => written.push(text),
        input: Readable.from(['2\n']),
      });

      expect(await prompts.select('Pick', ['a', 'b'], 0)).toBe(1);
      expect(written.join('')).toContain('Pick');
    });

    test('writes the question to stdout when no sink is given', async () => {
      const prompts = createNodePrompts({ input: Readable.from(['hi\n']) });
      expect(await prompts.input('Message', '', '', false)).toBe('hi');
    });

    test('reports end of input when the stream fails', async () => {
      // A broken stdin must end the question rather than leave gg waiting
      // on an answer that can no longer arrive.
      const broken = new Readable({
        read(): void {
          this.destroy(new Error('stdin is gone'));
        },
      });

      expect(await askOnTerminal(broken, () => {}, 'Q: ')).toBeNull();
    });

    test('reports end of input on an empty stream', async () => {
      const prompts = createNodePrompts({
        write: () => {},
        input: Readable.from([]),
      });

      await expect(prompts.input('Message', '', '', false)).rejects.toThrow(
        UnansweredPromptError,
      );
    });
  });

  // ###########################################################################
  describe('as part of the Node host', () => {
    test('is supplied by default', async () => {
      expect(createNodeHost().prompts).toBeDefined();
    });

    test('can be switched off', async () => {
      // Then gg refuses its interactive commands with an actionable
      // message instead of asking a question nobody is there to answer.
      expect(createNodeHost({ prompts: false }).prompts).toBeUndefined();
    });

    test('can be replaced', async () => {
      const { prompts } = scripted(['1']);
      expect(createNodeHost({ prompts }).prompts).toBe(prompts);
    });

    test('reads its answers from the stream the host was given', async () => {
      const written: string[] = [];
      const host = createNodeHost({
        stdin: Readable.from(['from the host\n']),
        onStdout: (text) => written.push(text),
      });

      expect(await host.prompts!.input('Message', '', '', false)).toBe(
        'from the host',
      );
      // The question goes through the host console, so an embedder that
      // captures gg's output captures the prompt with it.
      expect(written.join('')).toContain('Message');
    });
  });
});
