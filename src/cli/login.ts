/** `pinecall login <gateway>`: the key typed once, verified there, and kept in ~/.pinecall/credentials. */

import { parseArgs } from "node:util";

import { pinecallHome, writeGateway } from "./credentials.js";
import { shadowedByEnv } from "./env.js";
import type { Group } from "./groups.js";
import { aLineOfStdin, typedInSilence } from "./secret.js";
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
  const key = (await (how.key ?? (values["key-stdin"] === true ? aLineOfStdin : () => typedInSilence(PROMPT, out)))()).trim();
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
  const environment = how.env ?? process.env;
  writeGateway(url, { api_key: key, org: who.org }, pinecallHome(environment));
  out.write(`logged in to ${url} as org ${who.org} · ${who.env}\n`);
  const shadowed = shadowedByEnv(environment);
  if (shadowed !== undefined) err.write(`${shadowed}\n`);
  return 0;
}

