/** Discover production's sandbox URL from /.well-known/pinecall, cached for a day. */

import type { World } from "../client/signed.js";
import { keepSandbox, sandboxOf } from "./signed-in.js";

// Cache TTL for the sandbox URL; a verb refused at a stale URL forgets it immediately.
const A_DAY_MS = 24 * 60 * 60 * 1000;

/** An instance's unauthenticated self-description: its world and the other instance's URL. */
export interface Discovered {
  world: World;
  elsewhere: string | null;
}

/** Error message for a gateway too old to name its world. */
export function saysNoWorld(url: string): string {
  return `${url} names no world at /.well-known/pinecall, so it is older than this CLI: update the gateway, or use the pinecall released with it`;
}

/** Error message for a PINECALL_URL that points at a sandbox instead of production. */
export function isTheSandbox(url: string, production: string | null): string {
  return `${url} is a sandbox instance, and PINECALL_URL names production, where a person signs in: ${production ?? "its URL"}`;
}

/**
 * `GET /.well-known/pinecall` (no key needed). Throws when no world is named, rather than guessing:
 * a wrong guess would send sandbox writes to production.
 */
export async function discovered(url: string): Promise<Discovered> {
  const answer = await fetch(`${url.replace(/\/$/, "")}/.well-known/pinecall`);
  if (!answer.ok) throw new Error(saysNoWorld(url));
  const said = (await answer.json()) as { world?: unknown; elsewhere?: unknown };
  if (said.world !== "production" && said.world !== "sandbox") throw new Error(saysNoWorld(url));
  return { world: said.world, elsewhere: typeof said.elsewhere === "string" ? said.elsewhere : null };
}

/**
 * The sandbox URL (null when production is the only instance) and whether it came from the
 * session.json cache.
 */
export interface Found {
  url: string | null;
  kept: boolean;
}

/** Resolve the sandbox URL for a production URL, from cache or by asking production. */
export async function whereTheSandboxAnswers(production: string, home: string, now: number = Date.now()): Promise<Found> {
  const kept = sandboxOf(production, A_DAY_MS, now, home);
  if (kept !== undefined) return { url: kept, kept: true };
  const said = await discovered(production);
  if (said.world !== "production") throw new Error(isTheSandbox(production, said.elsewhere));
  keepSandbox(production, { url: said.elsewhere, read_at: now }, home);
  return { url: said.elsewhere, kept: false };
}

/** Drop the cached sandbox URL so the next lookup asks production. */
export function forgetTheSandbox(production: string, home: string): void {
  keepSandbox(production, undefined, home);
}
