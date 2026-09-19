/** `pinecall login [gateway]`: this machine signed in through a browser, as a person, for `link` to mint from. */

import { hostname } from "node:os";
import { parseArgs } from "node:util";

import { openInABrowser } from "./browser.js";
import { CLOUD_URL } from "./env.js";
import type { Group } from "./groups.js";
import { pinecallHome, signIn } from "./signed-in.js";
import { asked } from "./testing/gateway.js";
import { refusal, whoIs, type Who } from "./whoami.js";

const USAGE = "usage: pinecall login [gateway-url]";

// How often the terminal asks, and for how long. The gateway's word lives ten minutes, so this
// gives up a little after it does rather than polling a word that cannot come back.
const EVERY_MS = 2_000;
const GIVE_UP_MS = 11 * 60 * 1_000;

const TOOK_TOO_LONG = "nobody approved this terminal: `pinecall login` again when you are ready";

export const group: Group = {
  purpose: "sign this machine in through a browser; `link` asks for it when it is needed",
  usage: `${USAGE}

  Prints a link and opens it. You sign in there — in a browser, where a password belongs — and
  the page hands this terminal a key of its OWN, minted for you and labelled as this machine, so
  it is revoked on its own from Tokens. Nothing types a password into a shell, and the day your
  org signs in with Google this verb does not change.

  With no URL it is ${CLOUD_URL}, and it says so before anything is kept.

  The key is the machine's sign-in, kept in ~/.pinecall/session.json (0600; PINECALL_HOME moves
  it), and no verb runs on it: a project runs on the key \`pinecall link\` writes into its own
  .env. \`link\` signs the machine in itself when it is not, so this is rarely typed. A server has
  no login at all: a server's token from Tokens, in its secrets as PINECALL_KEY.`,
  run: login,
};

/** What login can be told besides the argv. Tests only: where to print, and how time passes. */
export interface Signing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** How the link is put in front of the person. A test watches instead of opening a browser. */
  open?: (url: string) => void;
  /** How long between asks, and how long before giving up. A test does not wait two seconds. */
  every?: number;
  until?: number;
}

/** Sign this machine in through a browser; the key is proved before it is kept. */
export async function login(argv: string[], how: Signing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { positionals } = parseArgs({ args: argv, allowPositionals: true, options: {} });
  const url = positionals[0] ?? CLOUD_URL;
  if (positionals[0] === undefined) out.write(`gateway  ${CLOUD_URL}   (the default — \`pinecall login <url>\` for your own)\n`);
  return (await signedInThrough(url, how, out, err)) === null ? 1 : 0;
}

/**
 * The browser's dance, the key proved, and this machine signed in: what `login` is and what
 * `link` does first on a machine that never signed in. The key, or null once the refusal was said.
 */
export async function signedInThrough(
  url: string,
  how: Signing,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<string | null> {
  const key = await throughABrowser(url, how, out, err);
  if (key === null) return null;
  // Proved before it is kept: a key that opens nothing is a file a person will trust tomorrow and
  // a refusal they will not understand.
  let who: Who;
  try {
    who = await whoIs({ url, apiKey: key });
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return null;
  }
  signIn(url, key, pinecallHome(how.env ?? process.env));
  out.write(`signed in to ${url} as ${who.name ?? who.label ?? "this key's person"}\n`);
  return key;
}

/**
 * The dance: a word this terminal asks for, a link the person opens, and the key left behind.
 *
 * The terminal never sees the password and the browser never sees this key until it is minted —
 * what travels in the URL is a word that dies in ten minutes and on first collection. Null once
 * the refusal has been printed.
 */
async function throughABrowser(
  url: string,
  how: Signing,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<string | null> {
  const door = { url, apiKey: "" };
  let opened: { code: string };
  try {
    opened = await asked<{ code: string }>(door, "/v1/login/pairings", {
      method: "POST",
      body: { device: thisMachine() },
    });
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return null;
  }
  const link = signingIn(url, opened.code);
  out.write(`\nopen this to sign in:\n${link}\n\nwaiting…\n`);
  (how.open ?? openInABrowser)(link);
  return await collected(door, opened.code, how, err);
}

/** Where the person signs this terminal in: the gateway's own page, carrying the word. */
export function signingIn(gateway: string, code: string): string {
  return `${gateway.replace(/\/$/, "")}/cli?c=${encodeURIComponent(code)}`;
}

/** Ask until the browser has answered, the word is gone, or nobody ever opened the link. */
async function collected(
  door: { url: string; apiKey: string },
  code: string,
  how: Signing,
  err: NodeJS.WritableStream,
): Promise<string | null> {
  const every = how.every ?? EVERY_MS;
  const until = Date.now() + (how.until ?? GIVE_UP_MS);
  while (Date.now() < until) {
    try {
      // 202 is a 2xx, so this is an empty body and not a refusal: nobody has approved the card
      // yet. A refusal here is the word being gone — collected, or expired — and it ends the wait.
      const answered = await asked<{ key?: string }>(door, `/v1/login/pairings/${code}/key`);
      if (answered?.key !== undefined) return answered.key;
    } catch (refused) {
      err.write(`${refusal(refused)}\n`);
      return null;
    }
    await after(every);
  }
  err.write(`${TOOK_TOO_LONG}\n`);
  return null;
}

/** What this terminal calls itself, so the card names it and the key is labelled by it. */
function thisMachine(): string {
  try {
    return hostname();
  } catch {
    return "cli";
  }
}

function after(ms: number): Promise<void> {
  return new Promise((rung) => setTimeout(rung, ms));
}
