/** `pinecall whoami`: which gateway this terminal talks to, whose key it holds, and where it found it. */

import { doorLine, theDoor } from "./env.js";
import type { Group } from "./groups.js";
import { asked, Refused, type Door } from "./testing/gateway.js";

// The door that answers who is knocking, written once: `login` proves a key at this same path,
// through whoIs() below, so neither verb spells it.
const WHOAMI = "/v1/whoami";

/** What the gateway says about the key that opened it: never the key, and never its hash. */
export interface Who {
  org: string;
  key_id: string;
  label: string | null;
  /** The world this key opens. Where you are IS the key you hold, so the verb says which. */
  env: string;
}

export const group: Group = {
  purpose: "which org and which key this terminal is holding",
  usage: `usage: pinecall whoami

  Prints the gateway every connecting verb would talk to, where the key came from, and what
  that gateway says the key is: the org, the key's id, the world it opens and the label it was
  issued under. The
  key itself is neither printed nor sent anywhere else.`,
  run,
};

/** Resolve the door, ask it who is knocking, and print the two lines. */
export async function run(
  _argv: string[],
  out: NodeJS.WritableStream = process.stdout,
  err: NodeJS.WritableStream = process.stderr,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
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

/** One line: whose key, which of theirs, which world it opens, and what it was issued for. */
export function describing(who: Who): string {
  const said = [`org ${who.org}`, `key ${who.key_id}`, who.env];
  if (who.label !== null) said.push(who.label);
  return said.join(" · ");
}

/**
 * What the gateway said when it refused, in its own words.
 *
 * A refusal arrives as a JSON body and a person should read the sentence in it, not the body:
 * "this door takes an API key" is the whole answer, and `{"detail": …}` around it is noise.
 */
export function refusal(failed: unknown): string {
  if (!(failed instanceof Refused)) return failed instanceof Error ? failed.message : String(failed);
  const said = detailOf(failed.text);
  return said === undefined ? failed.message : `the gateway answered ${failed.status}: ${said}`;
}

// FastAPI puts a refusal's sentence under `detail`; anything else is printed as it arrived.
function detailOf(text: string): string | undefined {
  try {
    const body: unknown = JSON.parse(text);
    const said = (body as { detail?: unknown }).detail;
    return typeof said === "string" ? said : undefined;
  } catch {
    return undefined;
  }
}
