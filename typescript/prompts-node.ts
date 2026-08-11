// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

// The questions gg asks, asked from Node.
//
// A native gg draws these with `package:interact`, which reaches
// `dart:ffi` and so cannot be part of a Wasm build. Everything it offers
// is rebuilt here on `node:readline`: the selection list is walked with
// the arrow keys, and the message editor starts with gg's proposal in the
// buffer, ready to be edited.
//
// Both need a terminal. When stdin is a pipe — a test, a script, CI —
// there is nothing to draw on, so the list falls back to numbered choices
// and the editor to a suggestion in brackets. Reading goes through
// `node:readline` either way, which is what lets these work on Windows:
// that is the whole reason gg's prompt contract is asynchronous, since a
// synchronous one would force a blocking read from file descriptor 0 and
// a Windows console handle does not answer that the way a pty does.

import { once } from 'node:events';
import { emitKeypressEvents } from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import type { PromptHost } from './host.js';

/**
 * Moves the cursor up, so the list is redrawn over itself.
 * @param lines - How many lines to go up.
 * @returns The escape sequence.
 */
const cursorUp = (lines: number): string => `\x1b[${lines}A`;
/** Erases everything from the cursor to the end of the screen. */
const eraseBelow = '\x1b[0J';
/** Hides the cursor, so a redrawn list does not flicker. */
const hideCursor = '\x1b[?25l';
/** Shows the cursor again. */
const showCursor = '\x1b[?25h';
/** Colours the marked entry, the way interact's list does. */
const activeOn = '\x1b[36m';
/** Switches the terminal back to its default colours. */
const colorOff = '\x1b[0m';

/** Options for {@link createNodePrompts}. */
export interface NodePromptOptions {
  /** Where the question is written. Defaults to `process.stdout`. */
  write?: (text: string) => void;
  /**
   * Asks `prompt` and returns the answer, `null` at end of input.
   *
   * `initialText` starts in the edit buffer. Defaults to
   * {@link askOnTerminal} against {@link NodePromptOptions.input}.
   */
  ask?: (prompt: string, initialText: string) => Promise<string | null>;
  /**
   * Lets the user pick one of `choices`, `null` at end of input.
   *
   * Defaults to {@link chooseByArrows} on a terminal and
   * {@link chooseByNumber} on anything else.
   */
  choose?: (
    prompt: string,
    choices: string[],
    initialIndex: number,
  ) => Promise<number | null>;
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
 * Whether [stream] is a terminal that can be drawn on and read key by key.
 * @param stream - The stream to check.
 * @returns Whether it is a terminal.
 */
function isTerminal(stream: NodeJS.ReadableStream): boolean {
  const tty = stream as NodeJS.ReadStream;
  return tty.isTTY === true && typeof tty.setRawMode === 'function';
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
 * @param initialText - Text to start the edit buffer with. Only on a
 *   terminal: on a pipe `rl.write` would prepend it to the piped answer
 *   instead of seeding an editable line.
 * @returns The answer, or `null` at end of input.
 */
export async function askOnTerminal(
  input: NodeJS.ReadableStream,
  write: (text: string) => void,
  prompt: string,
  initialText = '',
): Promise<string | null> {
  const output = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      write(chunk.toString());
      callback();
    },
  });

  const terminal = isTerminal(input);
  const rl = createInterface({ input, output, terminal });

  try {
    // `question` never settles when the input ends before an answer
    // arrives, so the close event has to end the wait — otherwise a
    // piped run would hang on a question nobody can answer.
    const closed = once(rl, 'close').then(() => null);
    const answer = rl.question(prompt);
    // Seeding the buffer is what makes this an editor rather than a
    // suggestion: gg's proposal is there to be changed, and an untouched
    // return accepts it.
    if (terminal && initialText !== '') rl.write(initialText);
    return await Promise.race([answer, closed]);
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

/**
 * Lets the user walk [choices] with the arrow keys and pick one.
 *
 * Needs a terminal: it takes stdin into raw mode to see the keys at all,
 * and redraws the list in place. `chooseByNumber` is the fallback for
 * everything else.
 * @param input - The terminal to read keys from.
 * @param write - Where the list is drawn.
 * @param prompt - The question, drawn above the list.
 * @param choices - The entries to pick from.
 * @param initialIndex - The entry marked first.
 * @returns The index picked, or `null` if the user gave up.
 */
export async function chooseByArrows(
  input: NodeJS.ReadableStream,
  write: (text: string) => void,
  prompt: string,
  choices: string[],
  initialIndex: number,
): Promise<number | null> {
  const tty = input as NodeJS.ReadStream;
  let active =
    initialIndex >= 0 && initialIndex < choices.length ? initialIndex : 0;
  let drawn = false;

  const render = (): void => {
    if (drawn) write(cursorUp(choices.length + 1));
    drawn = true;
    write(eraseBelow);
    write(`${prompt}\n`);
    for (const [index, choice] of choices.entries()) {
      write(
        index === active
          ? `${activeOn}> ${choice}${colorOff}\n`
          : `  ${choice}\n`,
      );
    }
  };

  emitKeypressEvents(tty);
  const wasRaw = tty.isRaw === true;
  tty.setRawMode(true);
  tty.resume();
  write(hideCursor);
  render();

  try {
    return await new Promise<number | null>((resolve) => {
      const finish = (picked: number | null): void => {
        tty.off('keypress', onKeypress);
        tty.off('close', onClose);
        tty.off('end', onClose);
        resolve(picked);
      };

      const onClose = (): void => finish(null);

      const onKeypress = (
        _text: string,
        key: { name?: string; ctrl?: boolean },
      ): void => {
        const step = (delta: number): void => {
          // Wrapping around is what interact's list does, and it saves
          // the long walk back for the last entry.
          active = (active + delta + choices.length) % choices.length;
          render();
        };

        switch (key.name) {
          case 'up':
          case 'k':
            return step(-1);
          case 'down':
          case 'j':
            return step(1);
          case 'return':
          case 'enter':
            return finish(active);
          case 'c':
            // Raw mode swallows the interrupt, so it has to be read as
            // one. gg then reports an unanswered prompt and stops, rather
            // than acting on a choice nobody made.
            if (key.ctrl === true) finish(null);
            return;
          default: {
            // The numbers still work — the list was numbered before, and
            // typing the number is quicker for a long one.
            const digit = Number.parseInt(key.name ?? '', 10);
            if (digit >= 1 && digit <= choices.length) {
              active = digit - 1;
              render();
            }
          }
        }
      };

      tty.on('keypress', onKeypress);
      tty.on('close', onClose);
      tty.on('end', onClose);
    });
  } finally {
    write(showCursor);
    if (!wasRaw) tty.setRawMode(false);
  }
}

/**
 * Asks for the number of one of [choices].
 *
 * The fallback for everything that is not a terminal — a pipe, a test,
 * CI — where there is no cursor to move and no screen to redraw.
 * @param ask - Asks one question and reads the answer.
 * @param write - Where the list is written.
 * @param prompt - The question, written above the list.
 * @param choices - The entries to pick from.
 * @param initialIndex - The entry an empty answer takes.
 * @returns The index picked, or `null` at end of input.
 */
export async function chooseByNumber(
  ask: (prompt: string, initialText: string) => Promise<string | null>,
  write: (text: string) => void,
  prompt: string,
  choices: string[],
  initialIndex: number,
): Promise<number | null> {
  const fallback =
    initialIndex >= 0 && initialIndex < choices.length ? initialIndex : 0;

  for (;;) {
    write(`${prompt}\n`);
    for (const [index, choice] of choices.entries()) {
      const marker = index === fallback ? '>' : ' ';
      write(`  ${marker} ${index + 1}) ${choice}\n`);
    }

    const answer = await ask(`Number [${fallback + 1}]: `, '');
    if (answer === null) return null;

    // Return accepts the marked choice — the same shortcut the arrow-key
    // list offers.
    const trimmed = answer.trim();
    if (trimmed === '') return fallback;

    const picked = Number.parseInt(trimmed, 10);
    if (Number.isInteger(picked) && picked >= 1 && picked <= choices.length) {
      return picked - 1;
    }

    write(`Please enter a number between 1 and ${choices.length}.\n`);
  }
}

/**
 * Builds the prompts gg asks its questions with under Node.
 * @param options - Where to write the question and read the answer.
 * @returns A host gg can ask.
 */
export function createNodePrompts(options: NodePromptOptions = {}): PromptHost {
  /* v8 ignore next — a test that let this fall through to the process'
     own stdin would block on it. */
  const input = options.input ?? process.stdin;
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const ask =
    options.ask ??
    ((prompt: string, initialText: string) =>
      askOnTerminal(input, write, prompt, initialText));
  const choose =
    options.choose ??
    ((prompt: string, choices: string[], initialIndex: number) =>
      isTerminal(input)
        ? chooseByArrows(input, write, prompt, choices, initialIndex)
        : chooseByNumber(ask, write, prompt, choices, initialIndex));

  return {
    async select(
      prompt: string,
      choices: string[],
      initialIndex: number,
    ): Promise<number> {
      const picked = await choose(prompt, choices, initialIndex);
      if (picked === null) throw new UnansweredPromptError(prompt);
      return picked;
    },

    async input(
      prompt: string,
      defaultValue: string,
      initialText: string,
    ): Promise<string> {
      // `asMessageEditor` only picks interact's colours, and there is
      // nothing to colour here, so it is ignored. The editor is a single
      // line on both sides — interact's `Input` is too.
      const terminal = isTerminal(input);

      // On a terminal the proposal goes into the buffer, exactly as
      // interact does it: clearing it and pressing return then means
      // »none«, which is what `defaultValue` says. On a pipe there is no
      // buffer to put it in, so it is shown in brackets and an empty
      // answer keeps it.
      const suggestion = initialText !== '' ? initialText : defaultValue;
      const question = terminal
        ? `${prompt} `
        : suggestion !== ''
          ? `${prompt} [${suggestion}]: `
          : `${prompt}: `;

      const answer = await ask(question, terminal ? initialText : '');
      if (answer === null) throw new UnansweredPromptError(prompt);
      if (answer.trim() !== '') return answer;

      return terminal ? defaultValue : suggestion;
    },
  };
}
