/** Where the CLI is pointed and what opens the door: the one place that decides both, for every verb. */

import { relative } from "node:path";

import type { World } from "../client/signed.js";
import { nearestDotenv, readDotenv } from "./dotenv.js";
import { forgetTheSandbox, whereTheSandboxAnswers } from "./elsewhere.js";
import { aSandboxKey } from "./sandbox-key.js";
import { pinecallHome } from "./signed-in.js";
import { refusal } from "./whoami.js";
import { PRODUCTION, SANDBOX, theChosenWorld } from "./world.js";

/** Pinecall's own cloud: the production every verb starts from when nothing names another. */
export const CLOUD_URL = "https://box.pinecall.io";

/** The key a verb knocks with and the gateway it knocks at: the project's, as any app reads its own. */
export const KEY_VARIABLE = "PINECALL_KEY";
export const URL_VARIABLE = "PINECALL_URL";

/** What the project holds: a gateway, the key if there is one, and where it was read. */
export interface Held {
  url: string;
  apiKey: string | undefined;
  /** Where the key was read: `the environment`, or the `.env` it came from, as a path from here. */
  source: string;
}

/** A gateway with the key in hand, and the world it is: what a verb holds after `theDoor` answered. */
export interface Open {
  url: string;
  apiKey: string;
  source: string;
  world: World;
  /** True when a sandbox verb landed at production because production names no sandbox beside it. */
  theOnlyInstance?: boolean;
}

/**
 * Which gateway and which key the project holds, the way every app reads its own secrets.
 *
 * `PINECALL_KEY` and `PINECALL_URL` from the process's environment — a server's secrets, a CI job's
 * — else from the nearest `.env` up from where the verb runs, which `pinecall link` wrote: each
 * project folder is the org it was linked to, and nothing is switched. The gateway is the cloud's
 * unless one of the two names another. v1's `PINECALL_API_KEY` is never read: a name another CLI on
 * the same machine exports was how a key of the wrong org was once handed over in silence.
 */
export function keyFrom(env: NodeJS.ProcessEnv = process.env, from: string = process.cwd()): Held {
  const exported = env[KEY_VARIABLE];
  if (exported !== undefined && exported !== "") {
    return { url: env[URL_VARIABLE] ?? CLOUD_URL, apiKey: exported, source: "the environment" };
  }
  const file = nearestDotenv(from);
  if (file === undefined) return { url: env[URL_VARIABLE] ?? CLOUD_URL, apiKey: undefined, source: "nowhere" };
  const values = readDotenv(file);
  const key = values[KEY_VARIABLE];
  return {
    url: env[URL_VARIABLE] ?? values[URL_VARIABLE] ?? CLOUD_URL,
    apiKey: key === "" ? undefined : key,
    source: relative(from, file) || file,
  };
}

// A server's token says its world in its prefix, as Stripe's do, and belongs to the one instance
// it was made on: PINECALL_URL is that instance, and nothing is derived from it. Read inside the
// function and not into a table beside it: world.ts reaches this file through whoami.ts.
/** The world a server's token was made for, or undefined for a person's key, which names none. */
export function aServersWorld(key: string): World | undefined {
  if (key.startsWith("pc_live_")) return PRODUCTION;
  if (key.startsWith("pc_test_")) return SANDBOX;
  return undefined;
}

/** Said when a server's token is asked for the world it was not made for. */
export function anotherWorldsToken(token: World, url: string): string {
  const fix = token === PRODUCTION ? "run the verb with --prod" : "run the verb without --prod";
  return `this PINECALL_KEY is a ${token} server's token, made at ${url}: ${fix}`;
}

/**
 * The gateway a verb knocks at, or nothing once it has said why it cannot: every verb's first act.
 *
 * An instance is one world. PINECALL_URL is production's — where a person signs in, and what their
 * key opens — so `--prod` knocks there with the project's key. The sandbox is another instance:
 * its URL is what production names at /.well-known/pinecall, and the key there is minted from the
 * project's (cli/sandbox-key.ts). Both are kept in ~/.pinecall/session.json, never in the project.
 */
export async function theDoor(
  env: NodeJS.ProcessEnv = process.env,
  err: NodeJS.WritableStream = process.stderr,
  from: string = process.cwd(),
  world: World = theChosenWorld(),
): Promise<Open | undefined> {
  const { apiKey, ...held } = keyFrom(env, from);
  if (apiKey === undefined) {
    err.write(`${NO_KEY}\n`);
    return undefined;
  }
  try {
    return await doorIn(world, { ...held, apiKey, world: PRODUCTION }, pinecallHome(env));
  } catch (failed) {
    err.write(`${refusal(failed)}\n`);
    return undefined;
  }
}

/**
 * The door of that world, from the project's own: itself, or the sandbox production names. A
 * production that names none is the only instance — a laptop's own gateway, a box of one — and
 * every verb runs there, saying production, as it did before the sandbox was an instance.
 */
export async function doorIn(world: World, project: Open, home: string): Promise<Open> {
  const token = aServersWorld(project.apiKey);
  if (token !== undefined) {
    if (token !== world) throw new Error(anotherWorldsToken(token, project.url));
    return { ...project, world };
  }
  if (world === PRODUCTION) return project;
  const found = await whereTheSandboxAnswers(project.url, home);
  try {
    return await theSandbox(project, found.url, home);
  } catch (refused) {
    // A sandbox URL kept from yesterday may be one the operator has moved: asked again, once.
    if (!found.kept) throw refused;
    forgetTheSandbox(project.url, home);
    return await theSandbox(project, (await whereTheSandboxAnswers(project.url, home)).url, home);
  }
}

async function theSandbox(production: Open, url: string | null, home: string): Promise<Open> {
  if (url === null) return { ...production, theOnlyInstance: true };
  const apiKey = await aSandboxKey(production, url, home);
  return { url, apiKey, source: `session.json, minted from ${production.source}'s`, world: SANDBOX };
}

/** What to say when there is no key here: the verb that writes one. */
export const NO_KEY =
  "no PINECALL_KEY here: `pinecall link` in the project's folder writes it to .env (a server keeps it in its secrets)";

/** The first line a verb that connects prints: which gateway, where its key was read, and its world. */
export function doorLine(door: Open): string {
  const alone = door.theOnlyInstance === true ? " (the only instance)" : "";
  return `gateway ${door.url} · key from ${door.source} · ${door.world}${alone}`;
}
