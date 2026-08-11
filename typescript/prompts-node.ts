// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The questions gg asks, asked from Node.
//
// A native gg draws these with `package:interact`: arrow keys for the
// selection lists, a pre-filled editable buffer for the messages. That
// library reaches `dart:ffi` and cannot be part of a Wasm build, so the
// selection here is a numbered list instead. The text input is a real
// editable line: `node:readline` provides the cursor keys, word jumps and
// history that a terminal user expects.
//
// Reading goes through `node:readline/promises`, which works on every
// platform Node runs on. That is the whole reason gg's prompt contract is
// asynchronous: a synchronous one would force a blocking read from file
// descriptor 0, and a Windows console handle does not answer that the way
// a pty does.

import { once } from 'node:events';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import type { PromptHost } from './host.js';

/** Options for {@link createNodePrompts}. */
export interface NodePromptOptions {
  /** Where the question is written. Defaults to `process.stdout`. */
  write?: (text: string) => void;
  /**
   * Asks `prompt` and returns the answer, `null` at end of input.
   *
   * Defaults to {@link askOnTerminal} against
   * {@link NodePromptOptions.input}.
   */
  ask?: (prompt: string) => Promise<string | null>;
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
 * Writes [prompt] and reads one edited line back.
 *
 * `readline` owns the prompt rather than the caller, because it needs the
 * prompt's width to place the cursor: writing it separately leaves the
 * arrow keys off by the length of the question.
 *
 * `terminal` is on only for a real terminal. That is what turns on the
 * line editing — without it the cursor keys arrive as raw escape
 * sequences and end up in the answer. For a pipe there is nothing to
 * edit, and raw mode would only garble the echo.
 * @param input - The stream to read from.
 * @param write - Where the prompt and the echo go.
 * @param prompt - The question, written before the cursor.
 * @returns The answer, or `null` at end of input.
 */
export async function askOnTerminal(
  input: NodeJS.ReadableStream,
  write: (text: string) => void,
  prompt: string,
): Promise<string | null> {
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      write(chunk.toString());
      callback();
    },
  });

  const rl = createInterface({
    input,
    output,
    terminal: (input as NodeJS.ReadStream).isTTY === true,
  });

  try {
    // `question` never settles when the input ends before an answer
    // arrives, so the close event has to end the wait — otherwise a
    // piped run would hang on a question nobody can answer.
    const closed = once(rl, 'close').then(() => null);
    return await Promise.race([rl.question(prompt), closed]);
  } catch {
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
  const ask =
    options.ask ?? ((prompt: string) => askOnTerminal(input, write, prompt));

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

        const answer = await ask(`Number [${fallback + 1}]: `);
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
      // `initialText`. readline cannot pre-fill one, so the text is shown
      // and an empty answer keeps it — the same outcome for a user who is
      // happy with what gg proposed.
      const suggestion = initialText !== '' ? initialText : defaultValue;
      const answer = await ask(
        suggestion !== '' ? `${prompt} [${suggestion}]: ` : `${prompt}: `,
      );
      if (answer === null) throw new UnansweredPromptError(prompt);

      return answer.trim() === '' ? suggestion : answer;
    },
  };
}
