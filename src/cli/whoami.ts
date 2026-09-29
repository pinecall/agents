/** `pinecall whoami`: the production and sandbox gateways this project uses, and who each key is. */

import { parseArgs } from "node:util";

import type { World } from "../client/signed.js";
import { aServersWorld, doorIn, doorLine, keyFrom, NO_KEY, type Open } from "./env.js";
import type { Group } from "./groups.js";
import { pinecallHome } from "./signed-in.js";
import { asked, type Door } from "./testing/gateway.js";
import { PRODUCTION, SANDBOX } from "./world.js";

// Also used by `login`, through whoIs().
const WHOAMI = "/v1/whoami";

/** The gateway's description of a key (never the key or its hash). */
export interface Who {
  org: string;
  /** The org's human-readable slug, e.g. `clinica`; absent on older gateways. */
  slug?: string | null;
  key_id: string;
  label: string | null;
  /** The world of the instance that answered. */
  env: string;
  /** The person the key was minted for; absent for a server token. */
  name?: string | null;
  /** Whether this key may act in production (the person's switch, any admin, or a production token). */
  production: boolean;
}

export const group: Group = {
  purpose: "which org and which key this terminal is holding, at production and at the sandbox",
  usage: `usage: pinecall whoami

  Prints both doors a verb may knock at: production's — PINECALL_URL, with the key from the
  environment or the project's .env — and the sandbox's, the instance production names, with the
  key minted there from yours (kept in ~/.pinecall/session.json). Under each, what that instance
  says the key is: the org, the key's id, the world, the label it was issued under, and whether
  you may act in production. A server's token opens its own instance alone, and a production
  that names no sandbox is the only instance: each prints one door.
  The keys themselves are neither printed nor sent anywhere else.`,
  run,
};

/** Print each gateway the project's key opens and who the key is there. */
export async function run(
  argv: string[],
  out: NodeJS.WritableStream = process.stdout,
  err: NodeJS.WritableStream = process.stderr,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  // Takes no flags; parsing with none rejects unknown ones such as --json.
  parseArgs({ args: argv, options: {} });
  const { apiKey, ...held } = keyFrom(env);
  if (apiKey === undefined) {
    err.write(`${NO_KEY}\n`);
    return 2;
  }
  const project: Open = { ...held, apiKey, world: PRODUCTION };
  const token = aServersWorld(apiKey);
  // Only the project's own gateway decides the exit code; a sandbox failure is just printed.
  const home = pinecallHome(env);
  if (token !== undefined) return (await told(token, doorIn(token, project, home), out, err)) ? 0 : 1;
  const sandbox = doorIn(SANDBOX, project, home);
  // No sandbox configured: production is the only instance.
  if (await sandbox.then((door) => door.theOnlyInstance === true, () => false)) {
    return (await told(PRODUCTION, sandbox, out, err)) ? 0 : 1;
  }
  const answered = await told(PRODUCTION, doorIn(PRODUCTION, project, home), out, err);
  await told(SANDBOX, sandbox, out, out);
  return answered ? 0 : 1;
}

// Print one gateway's line and key description, or the refusal; returns success.
async function told(
  world: World,
  opening: Promise<Open>,
  out: NodeJS.WritableStream,
  err: NodeJS.WritableStream,
): Promise<boolean> {
  try {
    const door = await opening;
    const who = await whoIs(door);
    out.write(`${doorLine(door)}\n  ${describing(who)}\n`);
    return true;
  } catch (refused) {
    err.write(`${world}: ${refusal(refused)}\n`);
    return false;
  }
}

/** Ask the gateway who this key belongs to. */
export async function whoIs(door: Door): Promise<Who> {
  return await asked<Who>(door, WHOAMI);
}

/** The org's slug for display, falling back to its id when there is none. */
export function orgOf(who: Who): string {
  return who.slug ?? who.org;
}

/** Format a key description as one line: org, key id, world, label, production access. */
export function describing(who: Who): string {
  const said = [`org ${orgOf(who)}`, `key ${who.key_id}`, who.env];
  if (who.label !== null) said.push(who.label);
  said.push(`production: ${who.production ? "yes" : "no"}`);
  return said.join(" · ");
}

/** The message of a refusal, without its JSON envelope. */
export function refusal(failed: unknown): string {
  return failed instanceof Error ? failed.message : String(failed);
}
