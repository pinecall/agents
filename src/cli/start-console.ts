/** The `console` line `pinecall start` prints: where a person looks at what this process is running. */

import { asked, Refused, type Door } from "./testing/gateway.js";

// What a gateway answers for a path no router of its declared.
const NO_SUCH_DOOR = 404;

/** `where` when the key opens production: the console is the gateway's own page. */
export const HOSTED = "hosted";

/** `where` when the key opens the sandbox and no `pinecall serve` is up on this machine. */
export const NOWHERE = "nowhere";

// Production's console is the gateway's page at `/a/<agent>`, and it holds a key of its own — never
// this process's. So this process mints a one-use code standing for its key (five minutes, once)
// and prints the URL that carries it; the page spends it for a key of the tab's own. A gateway
// that refuses the code is one line, and the app runs on.
/** Where the gateway's console of this agent is, with the code that signs the browser in. */
export function consoleUrl(gateway: string, slug: string, code: string): string {
  return `${gateway.replace(/\/$/, "")}/a/${encodeURIComponent(slug)}?login=${encodeURIComponent(code)}`;
}

/** Where this machine's console of this agent is: nothing to sign in to, so nothing in the URL. */
export function localUrl(sidecar: string, slug: string): string {
  return `${sidecar.replace(/\/$/, "")}/a/${encodeURIComponent(slug)}`;
}

// A 404 at this door means the gateway has no such door, which means it is OLDER than this CLI —
// a long-running dev gateway is the usual way to meet it, since nothing restarts one for you. A
// status is not a thing a person can act on, so the sentence says the cause and the fix instead.
const OLDER_GATEWAY =
  "this gateway has no login-code door, so it is older than this CLI. Restart it: it serves the console too, and that will be stale as well.";

/** Why the console line has no URL in it, in words that name the next move. */
export function whyNoConsole(refused: unknown): string {
  if (refused instanceof Refused) {
    return refused.status === NO_SUCH_DOOR ? OLDER_GATEWAY : `the gateway answered ${refused.status}`;
  }
  return refused instanceof Error ? refused.message : String(refused);
}

// The sandbox is watched on this machine and production on the gateway: two consoles, and this
// line is where a person learns which one is theirs right now. `where` is a sidecar's URL, or
// HOSTED, or NOWHERE.
/** The line under `connected`: the console's URL, or the verb that opens one. */
export async function consoleLine(door: Door, slug: string, where: string): Promise<string> {
  if (where === NOWHERE) return "console  `pinecall serve` opens it on this machine (or `pinecall start --serve`)";
  if (where !== HOSTED) return `console  ${localUrl(where, slug)}`;
  try {
    const minted = await asked<{ code: string }>(door, "/v1/login/codes", { method: "POST", body: {} });
    return `console  ${consoleUrl(door.url, slug, minted.code)}   (opens within five minutes, once)`;
  } catch (refused) {
    return `console  not available: ${whyNoConsole(refused)}`;
  }
}
