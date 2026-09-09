/** Where the CLI is pointed and what opens the door: the one place that decides both, for every verb. */

import { devGateway, gatewayFor, normalised, pinecallHome, theOnlyGateway } from "./credentials.js";

/** The gateway a developer runs on their own machine, which is where `pinecall run` starts. */
export const DEFAULT_URL = "http://localhost:8080";

/** Where the key came from, so a verb can say it and a person can check it without grepping. */
export type Source = "dev-file" | "env" | "credentials" | "dev-env" | "none";

/** What the resolution found: the gateway, the key if there is one, and where the key came from. */
export interface Found {
  url: string;
  apiKey: string | undefined;
  source: Source;
  /** Said once, when a key IS exported and this gateway provably does not take it. */
  ignoring?: string;
}

/** A gateway with the key in hand: what a verb holds after `theDoor` answered. */
export interface Open {
  url: string;
  apiKey: string;
  source: Source;
}

/**
 * Which gateway, which key, and where the key came from — the order, written once and nowhere else.
 *
 * The url is PINECALL_URL, then the local gateway's own file, then the one gateway `pinecall login`
 * kept when there is exactly one, then the default. The key is the
 * local gateway's when that is the gateway we are talking to, then PINECALL_API_KEY, then the row
 * `pinecall login` kept, then PINECALL_DEV_KEY. See docs/decisions/tenant-cli.md.
 */
export function doorFrom(env: NodeJS.ProcessEnv = process.env, home: string = pinecallHome(env)): Found {
  const local = devGateway(home);
  const url = env["PINECALL_URL"] ?? local?.url ?? theOnlyGateway(home) ?? DEFAULT_URL;
  // A gateway started on a dev key honours that key and no other, so a real org key exported in
  // this shell is provably wrong here. It is ignored out loud rather than sent and refused with a
  // bare 403 — which is the afternoon this rule was written to give back.
  if (local !== undefined && normalised(url) === normalised(local.url)) {
    const found: Found = { url, apiKey: local.key, source: "dev-file" };
    if (env["PINECALL_API_KEY"] !== undefined) found.ignoring = ignoringApiKey(url);
    return found;
  }
  const exported = env["PINECALL_API_KEY"];
  if (exported !== undefined) return { url, apiKey: exported, source: "env" };
  const kept = gatewayFor(url, home);
  if (kept !== undefined) return { url, apiKey: kept.api_key, source: "credentials" };
  // Last, so that a terminal which worked before this file existed still works: a dev key exported
  // by hand opens a gateway that has no file of its own, and nothing that did work stops.
  const dev = env["PINECALL_DEV_KEY"];
  if (dev !== undefined) return { url, apiKey: dev, source: "dev-env" };
  return { url, apiKey: undefined, source: "none" };
}

/** The gateway a verb knocks at, or nothing once it has said why it cannot: every verb's first act. */
export function theDoor(
  env: NodeJS.ProcessEnv = process.env,
  err: NodeJS.WritableStream = process.stderr,
): Open | undefined {
  const found = doorFrom(env);
  if (found.ignoring !== undefined) err.write(`${found.ignoring}\n`);
  if (found.apiKey === undefined) {
    err.write(`${noKey(found.url)}\n`);
    return undefined;
  }
  return { url: found.url, apiKey: found.apiKey, source: found.source };
}

/** What to say when nothing opens this gateway: the verb that fixes it, and the name CI sets. */
export function noKey(url: string): string {
  return `no key for ${url}: run \`pinecall login ${url}\`, or export PINECALL_API_KEY`;
}

/** Why a key that IS exported is not the one being sent: this gateway takes only its own. */
export function ignoringApiKey(url: string): string {
  return `ignoring PINECALL_API_KEY: the local gateway at ${url} honours its dev key only`;
}

/** The first line a verb that connects prints: which gateway, and where its key was found. */
export function doorLine(door: Open): string {
  return `gateway ${door.url} · key from ${door.source}`;
}
