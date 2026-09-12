/** `pinecall login <gateway>`: who you are there, and the key that proves it, kept in ~/.pinecall. */

import { parseArgs } from "node:util";

import { pinecallHome, writeGateway } from "./credentials.js";
import { shadowedByEnv } from "./env.js";
import type { Group } from "./groups.js";
import { aLineOfStdin, nobodyIsTyping, typedAloud, typedInSilence } from "./secret.js";
import { asked } from "./testing/gateway.js";
import { refusal, whoIs, type Who } from "./whoami.js";

const USAGE = "usage: pinecall login <gateway-url> [--org <slug>] [--email <you@…>] [--key-stdin]";

// The three a person knows. A password is asked for with nothing echoed; the other two are not
// secrets and are typed in the open, so a typo in an email is a thing you can see.
const ORG = "org: ";
const EMAIL = "email: ";
const PASSWORD = "password: ";

// A terminal nobody is sitting at answers every prompt with "" the instant it is made, and
// "nothing was typed" then reads as though somebody had pressed enter. This says what is actually
// true and what to do instead.
const NOBODY_THERE =
  "nothing is attached to this terminal, so there is nobody to ask. Export PINECALL_API_KEY, or pipe a key with --key-stdin.";

const NOTHING_TYPED = "nothing was typed: nothing was kept";

// Development, as `pinecall signup` keeps: a terminal is a laptop, and a laptop is where things
// are written. `run` and `chat` answer here, and an admin's development key holds every scope
// there is — it is only production that takes `app` off a person. The console's toggle is how the
// same person looks at production; docs/worlds-and-teams.md.
const A_LAPTOP = "development";

// What the key is labelled in the org's key list, so a person revoking one knows which it was.
const THIS_MACHINE = "cli";

export const group: Group = {
  purpose: "sign in to a gateway and keep the key it mints",
  usage: `${USAGE}

  Asks for your org, your email and your password — the same three the console asks — and keeps
  the key the gateway mints for them in ~/.pinecall/credentials (0600) under that URL. After it,
  every verb that connects finds the key by itself and nothing has to be exported. The password
  is never echoed, never stored and never sent anywhere but that gateway.

  The key it keeps is this laptop's DEVELOPMENT key, so \`pinecall run\` and \`pinecall chat\`
  answer in a world of your own and never in the one your customers call.

  --key-stdin reads a KEY from one line of stdin instead, for a machine: a server, a CI job, a
  container. That is what \`pinecall keys issue\` mints, and in a container there is no login at
  all — PINECALL_API_KEY in the environment is the same thing.`,
  run: login,
};

/** What login can be told besides the argv: where to print, and how the answers arrive. Tests only. */
export interface Signing {
  out?: NodeJS.WritableStream;
  err?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  /** How a secret is obtained. A test hands one in rather than driving a terminal. */
  secret?: (prompt: string) => Promise<string>;
  /** How a word in the open is obtained: the org, the email. */
  aloud?: (prompt: string) => Promise<string>;
}

/** Sign in as a person, or keep a machine's key; either way it is proved before it is kept. */
export async function login(argv: string[], how: Signing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      org: { type: "string" },
      email: { type: "string" },
      "key-stdin": { type: "boolean", default: false },
    },
  });
  const url = positionals[0];
  if (url === undefined) {
    err.write(`${USAGE}\n`);
    return 2;
  }
  const asking = how.secret !== undefined || how.aloud !== undefined;
  if (!asking && values["key-stdin"] !== true && nobodyIsTyping()) {
    err.write(`${NOBODY_THERE}\n`);
    return 2;
  }
  const secret = how.secret ?? ((prompt: string) => typedInSilence(prompt, out));
  const aloud = how.aloud ?? ((prompt: string) => typedAloud(prompt, out));

  const key =
    values["key-stdin"] === true
      ? (await aLineOfStdin()).trim()
      : await aPersonsKey(url, values.org, values.email, secret, aloud, err);
  if (key === null) return 1;
  if (key === "") {
    err.write(`${NOTHING_TYPED}\n`);
    return 2;
  }

  // Proved before it is kept, whichever way it was got: a key that opens nothing is a file a
  // person will trust tomorrow and a refusal they will not understand.
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

/**
 * The key `POST /v1/login` mints for a person, or null once the refusal has been said.
 *
 * The gateway answers one sentence for every wrong thing — the org, the email, the password — by
 * design: a door that told them apart would tell a stranger which orgs and which people exist. So
 * there is nothing to add to it, and this prints it as it was written.
 */
async function aPersonsKey(
  url: string,
  org: string | undefined,
  email: string | undefined,
  secret: (prompt: string) => Promise<string>,
  aloud: (prompt: string) => Promise<string>,
  err: NodeJS.WritableStream,
): Promise<string | null> {
  const said = {
    org: (org ?? (await aloud(ORG))).trim(),
    email: (email ?? (await aloud(EMAIL))).trim(),
    password: await secret(PASSWORD),
  };
  if (said.org === "" || said.email === "" || said.password === "") return "";
  try {
    const signed = await asked<{ key: string }>({ url, apiKey: "" }, "/v1/login", {
      method: "POST",
      body: { ...said, env: A_LAPTOP, device: THIS_MACHINE },
    });
    return signed.key;
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return null;
  }
}
