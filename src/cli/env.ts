/** Resolve the gateway URL, key and world every CLI verb uses. */

import { relative } from "node:path";

import type { World } from "../client/signed.js";
import { nearestDotenv, readDotenv } from "./dotenv.js";
import { forgetTheSandbox, whereTheSandboxAnswers } from "./elsewhere.js";
import { aSandboxKey } from "./sandbox-key.js";
import { pinecallHome } from "./signed-in.js";
import { refusal } from "./whoami.js";
import { PRODUCTION, SANDBOX, theChosenWorld } from "./world.js";

/** Pinecall's cloud: the default production gateway. */
export const CLOUD_URL = "https://box.pinecall.io";

/** Environment variables for the key and the gateway URL. */
export const KEY_VARIABLE = "PINECALL_KEY";
export const URL_VARIABLE = "PINECALL_URL";

/** The project's gateway, key (if any) and where the key was read. */
export interface Held {
  url: string;
  apiKey: string | undefined;
  /** `the environment`, or the `.env` path relative to the cwd. */
  source: string;
}

/** A resolved gateway: URL, key, key source and world. */
export interface Open {
  url: string;
  apiKey: string;
  source: string;
  world: World;
  /** True when a sandbox verb fell back to production because no sandbox instance exists. */
  theOnlyInstance?: boolean;
}

/**
 * Read `PINECALL_KEY` and `PINECALL_URL` from the environment, else from the nearest `.env`.
 * v1's `PINECALL_API_KEY` is deliberately ignored: another CLI may export it for a different org.
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

// Constants are read inside the function, not at module load: world.ts imports this file via whoami.ts.
/** The world a server token's prefix names (`pc_live_`, `pc_test_`); undefined for a person's key. */
export function aServersWorld(key: string): World | undefined {
  if (key.startsWith("pc_live_")) return PRODUCTION;
  if (key.startsWith("pc_test_")) return SANDBOX;
  return undefined;
}

/** Error message for a server token used against the other world. */
export function anotherWorldsToken(token: World, url: string): string {
  const fix = token === PRODUCTION ? "run the verb with --prod" : "run the verb without --prod";
  return `this PINECALL_KEY is a ${token} server's token, made at ${url}: ${fix}`;
}

/**
 * Resolve the gateway for the chosen world, or print why not and return undefined.
 * `--prod` uses PINECALL_URL with the project's key. The sandbox URL comes from production's
 * /.well-known/pinecall and its key is minted from the project's; both cached in ~/.pinecall/session.json.
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
 * The gateway for a world, derived from the project's production gateway. When production names
 * no sandbox, it is the only instance and sandbox verbs run there.
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
    // A cached sandbox URL may be stale: rediscover once.
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

/** Error message when no key is found. */
export const NO_KEY =
  "no PINECALL_KEY here: `pinecall link` in the project's folder writes it to .env (a server keeps it in its secrets)";

/** The first line a connecting verb prints: gateway, key source and world. */
export function doorLine(door: Open): string {
  const alone = door.theOnlyInstance === true ? " (the only instance)" : "";
  return `gateway ${door.url} · key from ${door.source} · ${door.world}${alone}`;
}
