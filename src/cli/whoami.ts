/** `pinecall whoami`: the two doors this project opens — production's and the sandbox's — and whose key each takes. */

import { parseArgs } from "node:util";

import type { World } from "../client/signed.js";
import { aServersWorld, doorIn, doorLine, keyFrom, NO_KEY, type Open } from "./env.js";
import type { Group } from "./groups.js";
import { pinecallHome } from "./signed-in.js";
import { asked, type Door } from "./testing/gateway.js";
import { PRODUCTION, SANDBOX } from "./world.js";

// The door that answers who is knocking, written once: `login` proves a key at this same path,
// through whoIs() below, so neither verb spells it.
const WHOAMI = "/v1/whoami";

/** What the gateway says about the key that opened it: never the key, and never its hash. */
export interface Who {
  org: string;
  /** The word a person types and reads — `clinica` — as against `org`, which is the id every
   * door takes. A gateway too old to answer it leaves it out, and the id is what is said then. */
  slug?: string | null;
  key_id: string;
  label: string | null;
  /** The world of the instance that answered: each one is a world of its own. */
  env: string;
  /** The person the key was minted for; none for a server's token. */
  name?: string | null;
  /** Whether this key may act in production: the person's switch (an admin always), or a production token. */
  production: boolean;
}

export const group: Group = {
  purpose: "which org and which key this terminal is holding, at production and at the sandbox",
  usage: `usage: pinecall whoami

  Prints both doors a verb may knock at: production's — PINECALL_URL, with the key from the
  environment or the project's .env — and the sandbox's, the instance production names, with the
  key minted there from yours (kept in ~/.pinecall/session.json). Under each, what that instance
  says the key is: the org, the key's id, the world, the label it was issued under, and whether
  you may act in production. A server's token opens its own instance alone, so it prints one.
  The keys themselves are neither printed nor sent anywhere else.`,
  run,
};

/** Resolve each door the project's key opens, ask each who is knocking, and print them. */
export async function run(
  argv: string[],
  out: NodeJS.WritableStream = process.stdout,
  err: NodeJS.WritableStream = process.stderr,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  // This verb takes no flag at all, and a parser that reads none is how it says so: `whoami
  // --json` was taken and answered with the same two lines, which reads as JSON having been
  // refused rather than never offered (2026-09-20).
  parseArgs({ args: argv, options: {} });
  const { apiKey, ...held } = keyFrom(env);
  if (apiKey === undefined) {
    err.write(`${NO_KEY}\n`);
    return 2;
  }
  const project: Open = { ...held, apiKey, world: PRODUCTION };
  const token = aServersWorld(apiKey);
  // The project's own door decides the exit: the sandbox's is told, and a box with none is no failure.
  const home = pinecallHome(env);
  const answered = await told(token ?? PRODUCTION, project, home, out, err);
  if (token === undefined) await told(SANDBOX, project, home, out, out);
  return answered ? 0 : 1;
}

// One door: its line and whose key it takes, or the sentence that says why there is none.
async function told(
  world: World,
  project: Open,
  home: string,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<boolean> {
  try {
    const door = await doorIn(world, project, home);
    const who = await whoIs(door);
    out.write(`${doorLine(door)}\n  ${describing(who)}\n`);
    return true;
  } catch (refused) {
    err.write(`${world}: ${refusal(refused)}\n`);
    return false;
  }
}

/** Who the gateway says is knocking with this key. */
export async function whoIs(door: Door): Promise<Who> {
  return await asked<Who>(door, WHOAMI);
}

/**
 * Whose org this is, in the word its people use.
 *
 * `org` is the id every door takes — `org_98889a61509c` on an org the box made — and a line that
 * prints THAT at a person prints them nothing. The id is said only when there is no slug: a
 * gateway too old to carry one, or an org whose row is gone.
 */
export function orgOf(who: Who): string {
  return who.slug ?? who.org;
}

/** One line: whose key, which of theirs, the world, what it was issued for, and production. */
export function describing(who: Who): string {
  const said = [`org ${orgOf(who)}`, `key ${who.key_id}`, who.env];
  if (who.label !== null) said.push(who.label);
  said.push(`production: ${who.production ? "yes" : "no"}`);
  return said.join(" · ");
}

/**
 * What the gateway said when it refused, in its own words.
 *
 * A refusal arrives as a JSON body and a person should read the sentence in it, not the body:
 * "this door takes an API key" is the whole answer, and `{"detail": …}` around it is noise.
 */
export function refusal(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}
