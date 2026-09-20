/** `pinecall whoami`: which gateway this terminal talks to, whose key it holds, and where it found it. */

import { parseArgs } from "node:util";

import { doorLine, theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, type Door } from "./testing/gateway.js";

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
  /** The world this request ran in: the one `--prod` named, else the sandbox — or a server token's own. */
  env: string;
  /** The person the key was minted for; none for a server's token. */
  name?: string | null;
  /** Whether this key may act in production: the person's switch (an admin always), or a production token. */
  production: boolean;
}

export const group: Group = {
  purpose: "which org and which key this terminal is holding",
  usage: `usage: pinecall whoami

  Prints the gateway every connecting verb would talk to, where the key came from (the
  environment, or the project's .env), and what that gateway says the key is: the org, the
  key's id, the world this command runs in, the label it was issued under, and whether you may
  act in production. The key itself is neither printed nor sent anywhere else.`,
  run,
};

/** Resolve the door, ask it who is knocking, and print the two lines. */
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
  const door = theDoor(env, err);
  if (door === undefined) return 2;
  let who: Who;
  try {
    who = await whoIs(door);
  } catch (refused) {
    err.write(`${refusal(refused)}\n`);
    return 1;
  }
  out.write(`${doorLine(door)}\n`);
  out.write(`${describing(who)}\n`);
  return 0;
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
