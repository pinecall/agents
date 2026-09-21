/** Where the CLI is pointed and what opens the door: the one place that decides both, for every verb. */

import { relative } from "node:path";

import type { World } from "../client/signed.js";
import { nearestDotenv, readDotenv } from "./dotenv.js";
import { theChosenWorld } from "./world.js";

/** Pinecall's own cloud: where every verb goes when nothing names another gateway. */
export const CLOUD_URL = "https://box.pinecall.io";

/**
 * The cloud's SANDBOX console: the same box under its second name, where a copy you are running
 * is watched. A console is a page and not a door — every verb still knocks at CLOUD_URL — so this
 * is only ever put in front of a person. A gateway that is not the cloud has a second name of its
 * own, which its operator knows and this CLI does not guess (cli/start-console.ts).
 */
export const SANDBOX_URL = "https://sandbox.pinecall.io";

/** The key a verb knocks with and the gateway it knocks at: the project's, as any app reads its own. */
export const KEY_VARIABLE = "PINECALL_KEY";
export const URL_VARIABLE = "PINECALL_URL";

/** What the resolution found: the gateway, the key if there is one, where it was read, the world asked. */
export interface Found {
  url: string;
  apiKey: string | undefined;
  /** Where the key was read: `the environment`, or the `.env` it came from, as a path from here. */
  source: string;
  /** `production` when `--prod` named that world for this one command. */
  world?: World;
}

/** A gateway with the key in hand: what a verb holds after `theDoor` answered. */
export interface Open {
  url: string;
  apiKey: string;
  source: string;
  world?: World;
}

/**
 * Which gateway and which key: the project's, the way every app reads its own secrets.
 *
 * `PINECALL_KEY` and `PINECALL_URL` from the process's environment — a server's secrets, a CI job's
 * — else from the nearest `.env` up from where the verb runs, which `pinecall link` wrote: each
 * project folder is the org it was linked to, and nothing is switched. The gateway is the cloud's
 * unless one of the two names another. v1's `PINECALL_API_KEY` is never read: a name another CLI on
 * the same machine exports was how a key of the wrong org was once handed over in silence.
 */
export function doorFrom(
  env: NodeJS.ProcessEnv = process.env,
  from: string = process.cwd(),
  world: World | undefined = theChosenWorld(),
): Found {
  const asked = world === undefined ? {} : { world };
  const exported = env[KEY_VARIABLE];
  if (exported !== undefined && exported !== "") {
    return { url: env[URL_VARIABLE] ?? CLOUD_URL, apiKey: exported, source: "the environment", ...asked };
  }
  const file = nearestDotenv(from);
  if (file === undefined) return { url: env[URL_VARIABLE] ?? CLOUD_URL, apiKey: undefined, source: "nowhere", ...asked };
  const values = readDotenv(file);
  const key = values[KEY_VARIABLE];
  return {
    url: env[URL_VARIABLE] ?? values[URL_VARIABLE] ?? CLOUD_URL,
    apiKey: key === "" ? undefined : key,
    source: relative(from, file) || file,
    ...asked,
  };
}

/** The gateway a verb knocks at, or nothing once it has said why it cannot: every verb's first act. */
export function theDoor(
  env: NodeJS.ProcessEnv = process.env,
  err: NodeJS.WritableStream = process.stderr,
  from: string = process.cwd(),
): Open | undefined {
  const found = doorFrom(env, from);
  if (found.apiKey === undefined) {
    err.write(`${NO_KEY}\n`);
    return undefined;
  }
  const { apiKey, ...rest } = found;
  return { ...rest, apiKey };
}

/** What to say when there is no key here: the verb that writes one. */
export const NO_KEY =
  "no PINECALL_KEY here: `pinecall link` in the project's folder writes it to .env (a server keeps it in its secrets)";

/** The first line a verb that connects prints: which gateway, where its key was read, and the world asked. */
export function doorLine(door: Open): string {
  const world = door.world === undefined ? "" : ` · ${door.world} (--prod)`;
  return `gateway ${door.url} · key from ${door.source}${world}`;
}
