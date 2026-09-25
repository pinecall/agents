/** Which world a verb works in: the sandbox, or production when `--prod` names it for one command. */

import { AsyncLocalStorage } from "node:async_hooks";

import type { World } from "../client/signed.js";
import type { Open } from "./env.js";
import { refusal, whoIs, type Who } from "./whoami.js";

/** The world a laptop is in: what is being written, held per person, nobody's customers calling. */
export const SANDBOX: World = "sandbox";

/** The world the org's customers reach. A person acts there while their org lets them. */
export const PRODUCTION: World = "production";

// The world one invocation named, carried by the async context and not by a module-level flag:
// every verb under it reads the same answer, a test running two verbs at once reads two, and
// nothing is left standing for the next command. The same mechanism the state's author uses.
const chosen = new AsyncLocalStorage<World>();

/** An invocation with `--prod` taken out of it, and the world it named. */
export interface Named {
  argv: string[];
  /** `production` when `--prod` was typed; undefined when it was not, and the verb is the sandbox's. */
  world: World | undefined;
}

/**
 * Take `--prod` out of an invocation's argv. It belongs to no group: it says which instance THIS
 * command knocks at (cli/env.ts), and production lets a person through only while their row opens
 * it. The group sees only its own flags.
 */
export function withoutTheWorldFlag(argv: readonly string[]): Named {
  return { argv: argv.filter((word) => word !== "--prod"), world: argv.includes("--prod") ? PRODUCTION : undefined };
}

/** Run one command in the world it named: everything under it, `theChosenWorld()` answers this. */
export function inTheWorld<T>(world: World | undefined, body: () => Promise<T>): Promise<T> {
  return world === undefined ? body() : chosen.run(world, body);
}

/** Production when this invocation said `--prod`; otherwise the sandbox. */
export function theChosenWorld(): World {
  return chosen.getStore() ?? SANDBOX;
}

/** What the gateway says this key is, at the instance of the world this command asked for. */
export async function standing(door: Open): Promise<Who> {
  return await whoIs(door);
}

/** When the gateway will not say who this key is: guessing is the bug this replaces. */
export function cannotTell(verb: string, failed: unknown): string {
  return `\`pinecall ${verb}\` will not guess who this key is: ${refusal(failed)}`;
}
