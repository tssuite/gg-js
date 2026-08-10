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
// Reading goes through `node:readline`, which works on every platform Node
// runs on. That is the whole reason gg's prompt contract is asynchronous:
// a synchronous one would force a blocking read from file descriptor 0,
// and a Windows console handle does not answer that the way a pty does.
//
// `terminal: false` is deliberate. It leaves the line editing to the
// terminal itself — echo, backspace, the lot — instead of readline taking
// the tty over, which is both simpler and identical across platforms.

import { createInterface } from 'node:readline';

import type { PromptHost } from './host.js';

/** Options for {@link createNodePrompts}. */
export interface NodePromptOptions {
  /** Where the question is written. Defaults to `process.stdout`. */
  write?: (text: string) => void;
  /**
   * Reads one line of the answer, `null` at end of input.
   *
   * Defaults to reading one line from {@link NodePromptOptions.input}.
   */
  readLine?: () => Promise<string | null>;
  /** The stream answers are read from. Defaults to `process.stdin`. */
  input?: NodeJS.ReadableStream;
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
 * Reads a single line from [input].
 * @param input - The stream to read from.
 * @returns The line without its newline, or `null` at end of input.
 */
export async function readLineFromStream(
  input: NodeJS.ReadableStream,
): Promise<string | null> {
  const rl = createInterface({ input, terminal: false });
  try {
    for await (const line of rl) {
      return line;
    }
    return null;
  } finally {
    rl.close();
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
  /* v8 ignore next — a test that let this fall through to the process'
     own stdin would block on it. */
  const input = options.input ?? process.stdin;
  const write =
    options.write ?? ((text: string) => process.stdout.write(text));
  const readLine = options.readLine ?? (() => readLineFromStream(input));

  return {
    async select(
      prompt: string,
      choices: string[],
      initialIndex: number,
    ): Promise<number> {
      const fallback =
        initialIndex >= 0 && initialIndex < choices.length ? initialIndex : 0;

      for (;;) {
        write(`${prompt}\n`);
        choices.forEach((choice, index) => {
          const marker = index === fallback ? '>' : ' ';
          write(`  ${marker} ${index + 1}) ${choice}\n`);
        });
        write(`Number [${fallback + 1}]: `);

        const answer = await readLine();
        if (answer === null) throw new UnansweredPromptError(prompt);

        // Return accepts the marked choice — the same shortcut interact's
        // list offers.
        const trimmed = answer.trim();
        if (trimmed === '') return fallback;

        const picked = Number.parseInt(trimmed, 10);
        if (
          Number.isInteger(picked) &&
          picked >= 1 &&
          picked <= choices.length
        ) {
          return picked - 1;
        }

        write(`Please enter a number between 1 and ${choices.length}.\n`);
      }
    },

    async input(
      prompt: string,
      defaultValue: string,
      initialText: string,
    ): Promise<string> {
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

      const answer = await readLine();
      if (answer === null) throw new UnansweredPromptError(prompt);

      return answer.trim() === '' ? suggestion : answer;
    },
  };
}
