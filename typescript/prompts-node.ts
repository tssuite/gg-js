// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The questions gg asks, asked from Node.
//
// A native gg draws these with `package:interact`: arrow keys for the
// selection lists, a pre-filled editable buffer for the messages. That
// library reaches `dart:ffi` and cannot be part of a Wasm build, so these
// are line-based instead — a numbered list and a plain line of input.
// Same questions, same answers, fewer keystrokes saved.
//
// Everything here is **synchronous**, because gg's callers are: they are
// reached from code that cannot await. The read therefore blocks on the
// file descriptor until the user hits return. gg only ever asks after
// `throwWhenNotATerminal` has confirmed a terminal is attached, so this
// never blocks a piped or headless run.

import { readLineFrom } from './host-node.js';
import type { PromptHost } from './host.js';

/** Options for {@link createNodePrompts}. */
export interface NodePromptOptions {
  /** Where the question is written. Defaults to `process.stdout`. */
  write?: (text: string) => void;
  /**
   * Reads one line of the answer, `null` at end of input.
   *
   * Defaults to a blocking read from {@link NodePromptOptions.stdinFd}.
   */
  readLine?: () => string | null;
  /** The descriptor the answers are read from. Defaults to stdin. */
  stdinFd?: number;
}

/**
 * Thrown when gg asks a question and stdin ends before it is answered.
 *
 * Better than picking a default: the questions gg asks decide what gets
 * published and which branch gets deleted.
 */
export class UnansweredPromptError extends Error {
  /**
   * Names the question that went unanswered.
   * @param prompt - The question gg asked.
   */
  constructor(prompt: string) {
    super(`gg-js: no answer for "${prompt}" — stdin ended.`);
    this.name = 'UnansweredPromptError';
  }
}

/**
 * Builds the prompts gg asks its questions with under Node.
 * @param options - Where to write the question and read the answer.
 * @returns A host gg can ask.
 */
export function createNodePrompts(
  options: NodePromptOptions = {},
): PromptHost {
  const write =
    options.write ?? ((text: string) => process.stdout.write(text));
  const readLine = options.readLine ?? (() => readLineFrom(options.stdinFd));

  return {
    select(prompt: string, choices: string[], initialIndex: number): number {
      const fallback =
        initialIndex >= 0 && initialIndex < choices.length ? initialIndex : 0;

      for (;;) {
        write(`${prompt}\n`);
        choices.forEach((choice, index) => {
          const marker = index === fallback ? '>' : ' ';
          write(`  ${marker} ${index + 1}) ${choice}\n`);
        });
        write(`Number [${fallback + 1}]: `);

        const answer = readLine();
        if (answer === null) throw new UnansweredPromptError(prompt);

        // Return accepts the marked choice — the same shortcut interact's
        // list offers.
        const trimmed = answer.trim();
        if (trimmed === '') return fallback;

        const picked = Number.parseInt(trimmed, 10);
        if (Number.isInteger(picked) && picked >= 1 && picked <= choices.length) {
          return picked - 1;
        }

        write(`Please enter a number between 1 and ${choices.length}.\n`);
      }
    },

    input(prompt: string, defaultValue: string, initialText: string): string {
      // `asMessageEditor` only picks interact's colours, and there is
      // nothing to colour here, so it is ignored. The editor is a single
      // line on both sides — interact's `Input` is too.
      //
      // interact does hand the user an editable buffer holding
      // `initialText`. A line reader cannot pre-fill one, so the text is
      // shown and an empty answer keeps it — the same outcome for a user
      // who is happy with what gg proposed.
      const suggestion = initialText !== '' ? initialText : defaultValue;
      write(suggestion !== '' ? `${prompt} [${suggestion}]: ` : `${prompt}: `);

      const answer = readLine();
      if (answer === null) throw new UnansweredPromptError(prompt);

      return answer.trim() === '' ? suggestion : answer;
    },
  };
}
