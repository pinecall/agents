/** The `console` line `pinecall start` prints: where a person looks at what this process is running. */

import { asked, Refused, type Door } from "./testing/gateway.js";

// What a gateway answers for a path no router of its declared.
const NO_SUCH_DOOR = 404;

// A console holds a key of its own — the browser's, minted at a login — and never this process's.
// So this process mints a one-use code standing for its key (five minutes, once) and prints the
// URL that carries it; the page spends it for a key of the tab's own. A gateway that refuses the
// code is one line, and the app runs on.
/** Where the console is, with the code that signs the browser in: an agent's screens, or the floor. */
export function consoleUrl(where: string, slug: string | undefined, code: string): string {
  const at = slug === undefined ? "/" : `/a/${encodeURIComponent(slug)}`;
  return `${where.replace(/\/$/, "")}${at}?login=${encodeURIComponent(code)}`;
}

// A 404 at this door means the gateway has no such door, which means it is OLDER than this CLI —
// a long-running dev gateway is the usual way to meet it, since nothing restarts one for you. A
// status is not a thing a person can act on, so the sentence says the cause and the fix instead.
const OLDER_GATEWAY =
  "this gateway has no login-code door, so it is older than this CLI. Restart it: it serves the console too, and that will be stale as well.";

/** Why the console line has no URL in it, in words that name the next move. */
export function whyNoConsole(refused: unknown): string {
  if (refused instanceof Refused) {
    // Its own message carries the gateway's sentence — "a server's token names nobody", and the
    // rest — which is what a person acts on; the bare status was what they were told before.
    return refused.status === NO_SUCH_DOOR ? OLDER_GATEWAY : refused.message;
  }
  return refused instanceof Error ? refused.message : String(refused);
}

/** A one-use code standing for this terminal's key: what signs a browser in without a key in a URL. */
export async function aLoginCode(door: Door): Promise<string> {
  return (await asked<{ code: string }>(door, "/v1/login/codes", { method: "POST", body: {} })).code;
}

// A console is served by the instance it shows, so the console of this process's world is the
// door it knocks at — production's, or the sandbox production named — and the code that signs the
// browser in is minted there, by that instance, for that instance's own key.
/** The line under `connected`: the console's URL, signed in, or why there is none. */
export async function consoleLine(door: Door, slug: string): Promise<string> {
  try {
    return `console  ${consoleUrl(door.url, slug, await aLoginCode(door))}   (opens within five minutes, once)`;
  } catch (refused) {
    return `console  not available: ${whyNoConsole(refused)}`;
  }
}
