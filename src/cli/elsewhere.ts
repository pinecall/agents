/** Where production's sandbox answers: the `elsewhere` its /.well-known/pinecall names, kept a day. */

import type { World } from "../client/signed.js";
import { keepSandbox, sandboxOf } from "./signed-in.js";

// How long a sandbox URL read off production is trusted without asking again. Moving an instance
// is an operator's rare act, and a verb that refuses at the old URL forgets it on the spot.
const A_DAY_MS = 24 * 60 * 60 * 1000;

/** What an instance says it is before anybody holds a key: its world, and where the other answers. */
export interface Discovered {
  world: World;
  elsewhere: string | null;
}

/** Said when the instance does not name its world: a gateway from before instances were worlds. */
export function saysNoWorld(url: string): string {
  return `${url} names no world at /.well-known/pinecall, so it is older than this CLI: update the gateway, or use the pinecall released with it`;
}

/** Said when PINECALL_URL is a sandbox: a person's key is production's, and so is their URL. */
export function isTheSandbox(url: string, production: string | null): string {
  return `${url} is a sandbox instance, and PINECALL_URL names production, where a person signs in: ${production ?? "its URL"}`;
}

/**
 * `GET /.well-known/pinecall`, the one door that takes no key. A gateway that does not answer it,
 * or answers no world, is refused here rather than guessed at: guessed wrong, a verb meant for the
 * sandbox would write production.
 */
export async function discovered(url: string): Promise<Discovered> {
  const answer = await fetch(`${url.replace(/\/$/, "")}/.well-known/pinecall`);
  if (!answer.ok) throw new Error(saysNoWorld(url));
  const said = (await answer.json()) as { world?: unknown; elsewhere?: unknown };
  if (said.world !== "production" && said.world !== "sandbox") throw new Error(saysNoWorld(url));
  return { world: said.world, elsewhere: typeof said.elsewhere === "string" ? said.elsewhere : null };
}

/**
 * The sandbox's URL — null when production names none, and is the only instance: a laptop's own
 * gateway, a box of one — and whether it came out of session.json rather than off production now.
 */
export interface Found {
  url: string | null;
  kept: boolean;
}

/** Where the sandbox of that production answers: kept from less than a day ago, else asked and kept. */
export async function whereTheSandboxAnswers(production: string, home: string, now: number = Date.now()): Promise<Found> {
  const kept = sandboxOf(production, A_DAY_MS, now, home);
  if (kept !== undefined) return { url: kept, kept: true };
  const said = await discovered(production);
  if (said.world !== "production") throw new Error(isTheSandbox(production, said.elsewhere));
  keepSandbox(production, { url: said.elsewhere, read_at: now }, home);
  return { url: said.elsewhere, kept: false };
}

/** Forget where that production's sandbox answers, so the next reading asks production again. */
export function forgetTheSandbox(production: string, home: string): void {
  keepSandbox(production, undefined, home);
}
