/** Where the CLI is pointed and what opens the door: the one place that decides both, for every verb. */

import { devGateway, gatewayFor, normalised, pinecallHome, theOnlyGateway } from "./credentials.js";
import { profileFor, theChosenProfile } from "./profiles.js";

/** The gateway a developer runs on their own machine, which is where `pinecall run` starts. */
export const DEFAULT_URL = "http://localhost:8080";

/** Pinecall's own cloud: where `pinecall signup` makes an org when no other gateway is named. */
export const CLOUD_URL = "https://box.pinecall.io";

/** Where the key came from, so a verb can say it and a person can check it without grepping. */
export type Source = "profile" | "dev-file" | "env" | "credentials" | "dev-env" | "none";

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
export function doorFrom(
  env: NodeJS.ProcessEnv = process.env,
  home: string = pinecallHome(env),
  profile?: string,
): Found {
  // The profile is the whole answer: one file, one name, both questions — which gateway and which
  // key — settled by the thing a person chose out loud with `pinecall login` or `pinecall use`,
  // and by `--profile` when a verb names another for this one command.
  //
  // `PINECALL_URL` and `PINECALL_API_KEY` are still read UNDER it, for one release, because half
  // the CLI's own tests hand a verb its key that way and there was nothing else to hand it one
  // with until this file existed. They go with those tests.
  const chosen = profileFor(profile, home);
  if (chosen !== undefined && (profile !== undefined || nothingIsExported(env))) {
    return { url: chosen.url, apiKey: chosen.key, source: "profile" };
  }
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

/** Whether this shell says anything about which gateway or which key: the one-release exception. */
function nothingIsExported(env: NodeJS.ProcessEnv): boolean {
  return env["PINECALL_API_KEY"] === undefined && env["PINECALL_URL"] === undefined;
}

/** The gateway a verb knocks at, or nothing once it has said why it cannot: every verb's first act. */
export function theDoor(
  env: NodeJS.ProcessEnv = process.env,
  err: NodeJS.WritableStream = process.stderr,
): Open | undefined {
  const found = doorFrom(env, pinecallHome(env), theChosenProfile());
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

/**
 * What a verb that just KEPT a key owes the person when the environment will win over it.
 *
 * `doorFrom` reads PINECALL_API_KEY before the credentials file, so a key exported in this shell
 * shadows the row `login` or `signup` has just written, silently — and the next verb answers for
 * another org, which reads as the sign-up having failed. Said once, where it is still cheap to fix.
 */
export function shadowedByEnv(env: NodeJS.ProcessEnv): string | undefined {
  return env["PINECALL_API_KEY"] === undefined
    ? undefined
    : "note: PINECALL_API_KEY is exported in this shell and is read first, so it is the key the "
      + "next verb will send. `unset PINECALL_API_KEY` to use the one just kept.";
}

/** The first line a verb that connects prints: which gateway, and where its key was found. */
export function doorLine(door: Open): string {
  return `gateway ${door.url} · key from ${door.source}`;
}
