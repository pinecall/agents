/** `pinecall login [gateway]`: signed in through a browser, and the key it mints kept in ~/.pinecall. */

import { hostname } from "node:os";
import { parseArgs } from "node:util";

import { openInABrowser } from "./browser.js";
import { pinecallHome, writeGateway } from "./credentials.js";
import { activate, chosenGateway, nameFor, nameForOrg, readConfig, writeProfile, type Keys, type World } from "./profiles.js";
import { CLOUD_URL } from "./env.js";
import type { Group } from "./groups.js";
import { aLineOfStdin } from "./secret.js";
import { asked } from "./testing/gateway.js";
import { orgOf, refusal, whoIs, type Who } from "./whoami.js";

const USAGE = "usage: pinecall login [gateway-url] [--key-stdin]";

// How often the terminal asks, and for how long. The gateway's word lives ten minutes, so this
// gives up a little after it does rather than polling a word that cannot come back.
const EVERY_MS = 2_000;
const GIVE_UP_MS = 11 * 60 * 1_000;

const TOOK_TOO_LONG = "nobody approved this terminal: `pinecall login` again when you are ready";

export const group: Group = {
  purpose: "sign in through a browser and keep the key it mints",
  usage: `${USAGE}

  Prints a link and opens it. You sign in there — in a browser, where a password belongs — and
  the page hands this terminal a key of its OWN, minted for you and labelled as this machine, so
  it is revoked on its own from the Keys screen. Nothing types a password into a shell, and the
  day your org signs in with Google this verb does not change.

  With no URL it is the gateway this machine is pointed at — ${CLOUD_URL} until \`pinecall gateway
  <url>\` says otherwise — and it says which one out loud before anything is kept.

  The key it keeps is this machine's SANDBOX key, so \`pinecall run\` and \`pinecall chat\`
  answer in a world of your own and never in the one your customers call.

  --key-stdin reads a KEY from one line of stdin instead, for a machine: a server, a CI job, a
  container. That is what \`pinecall keys issue\` mints, and it writes the same profile — so a
  machine and a person hold a key the same way, in a 0600 file read once rather than in an
  environment every child process and every \`ps\` can read. PINECALL_HOME says where that file
  goes, and it is the only variable this CLI reads.`,
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

/** Sign in through a browser, or keep a machine's key; either way it is proved before it is kept. */
export async function login(argv: string[], how: Signing = {}): Promise<number> {
  const out = how.out ?? process.stdout;
  const err = how.err ?? process.stderr;
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { "key-stdin": { type: "boolean", default: false }, as: { type: "string" } },
  });
  const { url, assumed } = theGateway(positionals[0], pinecallHome(how.env ?? process.env));
  if (assumed !== undefined) out.write(`${assumed}\n`);

  const key =
    values["key-stdin"] === true ? (await aLineOfStdin()).trim() : await throughABrowser(url, how, out, err);
  if (key === null) return 1;
  if (key === "") {
    err.write("no key was typed: nothing was kept\n");
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
  const home = pinecallHome(environment);
  // The slug and not the id, in the file as on the line: a person opening the config to see which
  // org a gateway is has to read a word they recognise.
  //
  // It is kept twice on purpose, for exactly one release: `config.json` is what every verb reads
  // now, and `credentials` is what v1's CLI on this same machine still reads. The second write
  // goes with the second half of this change.
  const name = values.as ?? nameFor(url, readConfig(home));
  const kept = await everyOrgOfTheirs({ url, apiKey: key }, who, values.as ?? name, values.as !== undefined, home);
  writeGateway(url, { api_key: key, org: orgOf(who) }, home);
  for (const line of kept) out.write(`${line}\n`);
  return 0;
}

// What a person held was ONE key: the sandbox of whichever org of theirs was oldest. A second org,
// or a look at production, meant logging in again with a flag nobody could guess. The gateway
// mints the rest from the key in hand (POST /v1/login/org, POST /v1/login/env), so the login does
// it here, once: a profile per org, both worlds in each, and `pinecall use` is the whole of moving.
/** Every org this key's person belongs to, kept as a profile each, with the keys of both worlds. */
async function everyOrgOfTheirs(door: Door, who: Who, fallback: string, named: boolean, home: string): Promise<string[]> {
  const world = who.env as World;
  // `--as` names ONE profile, and a machine key names nobody: both keep exactly the key in hand.
  const mine = named ? [] : await theirOrgs(door);
  if (mine.length === 0) {
    const keys = await bothWorlds(door, world);
    writeProfile(fallback, { url: door.url, key: door.apiKey, keys, org: orgOf(who), env: who.env }, home);
    return [`▸ ${fallback} · ${door.url} · org ${orgOf(who)} · ${worldsIn(keys, world)}`];
  }
  const said: string[] = [];
  let here: string | undefined;
  for (const org of mine) {
    const key = org.here ? door.apiKey : await inThatOrg(door, org.org);
    if (key === null) continue;
    const name = nameForOrg(org.slug ?? org.org, door.url, readConfig(home));
    const keys = await bothWorlds({ url: door.url, apiKey: key }, world);
    writeProfile(name, { url: door.url, key, keys, org: org.slug ?? org.org, env: who.env }, home);
    if (org.here) here = name;
    said.push(`${org.here ? "▸" : " "} ${name} · ${door.url} · ${worldsIn(keys, world)}`);
  }
  // The org they signed in to is the one in hand; the rest are a `pinecall use` away.
  if (here !== undefined) activate(here, home);
  if (said.length > 1) said.push("  `pinecall use <org>` moves between them; `pinecall use <org> production` looks at production");
  return said;
}

/** The orgs the person holds a key in, or none for a machine key and for a gateway without the door. */
async function theirOrgs(door: Door): Promise<Mine[]> {
  try {
    return (await asked<{ orgs: Mine[] }>(door, "/v1/login/orgs", { method: "GET" })).orgs.filter((org) => org.member !== false);
  } catch {
    return [];
  }
}

/** The same person's key in another org of theirs, or null when the gateway would not mint one. */
async function inThatOrg(door: Door, org: string): Promise<string | null> {
  try {
    return (await asked<{ key: string }>(door, "/v1/login/org", { method: "POST", body: { org } })).key;
  } catch {
    return null;
  }
}

/** This key and its sibling in the other world, when the gateway mints one for this person. */
async function bothWorlds(door: Door, world: World): Promise<Keys> {
  const other: World = world === "sandbox" ? "production" : "sandbox";
  const keys: Keys = { [world]: door.apiKey };
  try {
    keys[other] = (await asked<{ key: string }>(door, "/v1/login/env", { method: "POST", body: { env: other } })).key;
  } catch {
    // A machine key opens one world and may not mint the other: the profile holds what there is.
  }
  return keys;
}

// The world in hand first and marked, so the line reads as where the next verb goes.
function worldsIn(keys: Keys, inHand: World): string {
  const other: World = inHand === "sandbox" ? "production" : "sandbox";
  return keys[other] === undefined ? inHand : `${inHand} (and ${other})`;
}

interface Door {
  url: string;
  apiKey: string;
}

/** One row of `GET /v1/login/orgs`: the org, the word a person reads, and whether this key is its. */
interface Mine {
  org: string;
  slug?: string | null;
  here: boolean;
  /** False where an operator may enter without belonging: not theirs to keep a profile of. */
  member?: boolean;
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

/**
 * Which gateway this login is for, and the line to print when nobody said.
 *
 * A URL nobody typed is the cloud's, and that is said OUT LOUD before anything is kept: a person
 * who meant their own box has to be able to see that this one was assumed, in the line above the
 * link, rather than discovering it in `pinecall whoami` tomorrow.
 */
export function theGateway(named: string | undefined, home?: string): { url: string; assumed?: string } {
  if (named !== undefined) return { url: named };
  const chosen = chosenGateway(home);
  if (chosen !== undefined) return { url: chosen, assumed: `gateway  ${chosen}   (this machine's, from \`pinecall gateway\`)` };
  return {
    url: CLOUD_URL,
    assumed: `gateway  ${CLOUD_URL}   (the default — \`pinecall gateway <url>\` for your own box)`,
  };
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
