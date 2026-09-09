/** `pinecall login <gateway>`: the key typed once, verified there, and kept in ~/.pinecall/credentials. */

import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

import { pinecallHome, writeGateway } from "./credentials.js";
import type { Group } from "./groups.js";
import { refusal, whoIs, type Who } from "./whoami.js";

const USAGE = "usage: pinecall login <gateway-url> [--key-stdin]";

// What is asked for, and what is printed while it is typed: nothing.
const PROMPT = "API key: ";

export const group: Group = {
  purpose: "sign in and keep the credentials",
  usage: `${USAGE}

  Asks for the org's API key without echoing it, verifies it at <gateway-url>/v1/whoami, and
  keeps it in ~/.pinecall/credentials (0600) under that URL. After it, every verb that connects
  finds the key by itself and nothing has to be exported. --key-stdin reads the key from one
  line of stdin instead, for a script. The key is never printed and never logged.`,
  run: login,
};

/** What login can be told besides the argv: where to print, and how the key arrives. Tests only. */
export interface Signing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** How the key is obtained. A test hands one in rather than driving a terminal. */
  key?: () => Promise<string>;
}

/** Read the key, prove it at the gateway, and keep it under that gateway's URL. */
export async function login(argv: string[], how: Signing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { "key-stdin": { type: "boolean", default: false } },
  });
  const url = positionals[0];
  if (url === undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  const key = (await (how.key ?? (values["key-stdin"] === true ? aLineOfStdin : () => hidden(out)))()).trim();
  if (key === "") {
    err.write("no key was typed: nothing was kept\n");
    return 2;
  }
  // Verified before it is kept: a key that opens nothing is a file a person will trust tomorrow
  // and a refusal they will not understand. The gateway's own sentence says which it is.
  let who: Who;
  try {
    who = await whoIs({ url, apiKey: key });
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  writeGateway(url, { api_key: key, org: who.org }, pinecallHome(how.env ?? process.env));
  out.write(`logged in to ${url} as org ${who.org}\n`);
  return 0;
}

/**
 * One line typed with nothing echoed.
 *
 * A key on the screen is a key in the scrollback, in a screen share and in whatever recorded the
 * terminal. readline echoes what it reads through one method, so muting is overriding that method
 * rather than putting the terminal in raw mode and reading bytes.
 */
async function hidden(out: NodeJS.WritableStream): Promise<string> {
  const reading = createInterface({ input: process.stdin, output: out, terminal: true });
  (reading as unknown as { _writeToOutput(text: string): void })._writeToOutput = () => {};
  out.write(PROMPT);
  const key = await new Promise<string>((typed) => reading.question("", typed));
  reading.close();
  out.write("\n");
  return key;
}

// The script's way in: one line, no terminal, nothing asked. `echo $KEY | pinecall login … --key-stdin`.
async function aLineOfStdin(): Promise<string> {
  const reading = createInterface({ input: process.stdin });
  for await (const line of reading) {
    reading.close();
    return line;
  }
  return "";
}
