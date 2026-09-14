/** `pinecall signup`: an org on Pinecall's cloud, made here, and its first key kept like a login's. */

import { parseArgs } from "node:util";

import { pinecallHome, writeGateway } from "./credentials.js";
import { CLOUD_URL } from "./env.js";
import type { Group } from "./groups.js";
import { aLineOfStdin, typedInSilence } from "./secret.js";
import { asked, discovered } from "./testing/gateway.js";
import { refusal } from "./whoami.js";

const USAGE = `usage: pinecall signup [<gateway-url>] --org <slug> --email <you@…> --person "<your name>"
                       [--name "<Org Name>"] [--password-stdin]`;

// Asked for, never echoed, never a flag: a password on a command line is a password in the
// shell's history. The same rule `login` holds its key to.
const PROMPT = "Password (12 characters at least): ";

// The door a stranger knocks at, and what it answers: the one shape a key travels in, plus the
// org's slug, the member and a one-use code for a browser. runtime docs/protocol/people.md.
const SIGNUP = "/v1/signup";

// The same person's key in the other world. The sign-up answers a production one — every door of
// the org, and not `app`, because a deployed agent is held by a machine — and a terminal is a
// laptop: what it keeps is the sandbox key, which is the world `pinecall run` answers in.
const THE_OTHER_WORLD = "/v1/login/env";
const SANDBOX = "sandbox";

// Said when the second world could not be minted: the org exists and the production key is kept,
// so nothing is lost, but `run` will be refused until the person holds a sandbox key.
const ONE_WORLD_ONLY = (url: string): string =>
  `kept the production key: ${url} would not mint a sandbox one, and \`pinecall run\` needs it`;

// Whether that door is open here is the gateway's own fact, asked before anything else: a person
// should not type a password for a door that will refuse it. The gateway's refusal names the
// setting; this says the same thing before the typing rather than after.
const SHUT = (url: string): string =>
  `${url} takes no sign-ups: its operator opens them with PINECALL_SIGNUP, or makes the org and invites you — then \`pinecall login ${url}\``;

/** What the gateway answers a sign-up: the key once, whose it is, and the way into the console. */
interface SignedUp {
  key: string;
  org: string;
  slug: string;
  name: string | null;
  code: string;
}

export const group: Group = {
  purpose: "make an org on Pinecall's cloud and keep its first key",
  usage: `${USAGE}

  Makes the org with you as its admin. What it may do is whatever the people who run that
  gateway decided for a new one: on a box of your own, everything; on a hosted one, its trial.
  The gateway is ${CLOUD_URL} unless another is named. The password is asked for without
  echoing it, or read from one line of stdin with --password-stdin.

  What this terminal keeps is the SANDBOX key, in ~/.pinecall/credentials (0600) under that
  gateway, so \`pinecall run\` and \`pinecall chat\` work straight after and nothing has to be
  exported: a laptop is where things are written. The console link it prints signs the browser
  in to production, which is where the org's numbers, people and usage are. What answers a
  production number is a key issued for a machine — \`pinecall keys issue\` — and never a laptop.

  A gateway that is a box of its own takes no sign-up and says so: there, an operator makes the
  org and invites you, and you arrive with \`pinecall login\`.`,
  run: signup,
};

/** What signup can be told besides the argv: where to print, and how the password arrives. Tests only. */
export interface Making {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** How the password is obtained. A test hands one in rather than driving a terminal. */
  password?: () => Promise<string>;
}

/** Read what the org will be, make it at the gateway, and keep the key it answers. */
export async function signup(argv: string[], how: Making = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      org: { type: "string" },
      name: { type: "string" },
      email: { type: "string" },
      person: { type: "string" },
      "password-stdin": { type: "boolean", default: false },
    },
  });
  const url = positionals[0] ?? CLOUD_URL;
  const missing = (["org", "email", "person"] as const).filter((one) => values[one] === undefined);
  if (missing.length > 0) {
    err.write(`${USAGE}\n`);
    err.write(`missing: ${missing.map((one) => `--${one}`).join(" ")}\n`);
    return 2;
  }
  if (!(await discovered(url)).signup) {
    err.write(`${SHUT(url)}\n`);
    return 1;
  }
  const password = (await (how.password ?? (values["password-stdin"] === true ? aLineOfStdin : () => typedInSilence(PROMPT, out)))()).trim();
  if (password === "") {
    err.write("no password was typed: nothing was made\n");
    return 2;
  }
  let made: SignedUp;
  try {
    // No key opens this door: it is the one that mints the first one.
    made = await asked<SignedUp>({ url, apiKey: "" }, SIGNUP, {
      method: "POST",
      body: { org: values.org, name: values.name, email: values.email, person: values.person, password, device: "cli" },
    });
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  const environment = how.env ?? process.env;
  const laptop = await theSandboxKey(url, made.key);
  if (laptop === undefined) err.write(`${ONE_WORLD_ONLY(url)}\n`);
  writeGateway(url, { api_key: laptop ?? made.key, org: made.org }, pinecallHome(environment));
  out.write(`${madeLine(made, url)}\n`);
  out.write(`console  ${url.replace(/\/$/, "")}/?login=${encodeURIComponent(made.code)}   (opens within five minutes, once)\n`);
  return 0;
}

/**
 * The sandbox key, or nothing at all.
 *
 * A refusal here is not the sign-up failing: the org is made and its production key is in hand.
 * So it is answered as an absence and said on stderr, rather than thrown over an org that exists.
 */
async function theSandboxKey(url: string, key: string): Promise<string | undefined> {
  try {
    const minted = await asked<{ key: string }>({ url, apiKey: key }, THE_OTHER_WORLD, {
      method: "POST",
      body: { env: SANDBOX },
    });
    return minted.key;
  } catch {
    return undefined;
  }
}

/** The one line that says what now exists and that this terminal is holding its key. */
export function madeLine(made: SignedUp, url: string): string {
  const who = made.name === null ? "its admin" : made.name;
  return `created org ${made.slug} on ${url} — signed in as ${who}, sandbox key kept in ~/.pinecall/credentials`;
}
