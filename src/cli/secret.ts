/** What this terminal is asked for: a secret with nothing echoed, a word in the open, or a line of stdin. */

import { createInterface } from "node:readline";

/**
 * One line typed with nothing echoed.
 *
 * A key on the screen is a key in the scrollback, in a screen share and in whatever recorded the
 * terminal. readline echoes what it reads through one method, so muting is overriding that method
 * rather than putting the terminal in raw mode and reading bytes.
 */
export async function typedInSilence(prompt: string, out: NodeJS.WritableStream): Promise<string> {
  const reading = createInterface({ input: process.stdin, output: out, terminal: true });
  (reading as unknown as { _writeToOutput(text: string): void })._writeToOutput = () => {};
  out.write(prompt);
  const secret = await new Promise<string>((typed) => reading.question("", typed));
  reading.close();
  out.write("\n");
  return secret;
}

/** One line typed in the open: an org, an email — anything that is not a secret. */
export async function typedAloud(prompt: string, out: NodeJS.WritableStream): Promise<string> {
  const reading = createInterface({ input: process.stdin, output: out, terminal: true });
  const said = await new Promise<string>((typed) => reading.question(prompt, typed));
  reading.close();
  return said;
}

/** Whether anybody is at this terminal. With nobody, a prompt returns "" the instant it is made,
 * and a verb that asked has to say THAT rather than "nothing was typed" — which reads as though
 * the person had pressed enter. */
export function nobodyIsTyping(): boolean {
  return process.stdin.isTTY !== true;
}

/** The script's way in: one line, no terminal, nothing asked. `echo $KEY | pinecall keys add …`. */
export async function aLineOfStdin(): Promise<string> {
  const reading = createInterface({ input: process.stdin });
  for await (const line of reading) {
    reading.close();
    return line;
  }
  return "";
}
