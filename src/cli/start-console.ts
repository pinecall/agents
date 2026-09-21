/** The `console` line `pinecall start` prints: where a person looks at what this process is running. */

import { CLOUD_URL, SANDBOX_URL } from "./env.js";
import { asked, Refused, type Door } from "./testing/gateway.js";
import { PRODUCTION } from "./world.js";

// What a gateway answers for a path no router of its declared.
const NO_SUCH_DOOR = 404;

/**
 * Where the console of that world is, or undefined when it cannot be known from here.
 *
 * A box answers to its own name and, when it has a sandbox, to a second one. The first is the
 * gateway this terminal talks to, so production's console needs nothing said. The second is the
 * box's to name, and this CLI knows only the cloud's — a tenant's own box is told by its own
 * operator, and a URL guessed for them would be a URL that does not answer.
 */
export function consoleFor(gateway: string, world: string): string | undefined {
  const named = gateway.replace(/\/$/, "");
  if (world === PRODUCTION) return named;
  return named === CLOUD_URL ? SANDBOX_URL : undefined;
}

/** Said instead of a URL for a box whose second name only its operator knows. */
export const ITS_OWN_NAME =
  "your box's sandbox console is at its second name (PINECALL_SANDBOX_DOMAIN on the box)";

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

// The two consoles are the box's two names, and which one this process's work shows up in is the
// world it registered in — never a choice made here.
/** The line under `connected`: the console's URL, signed in, or why there is none. */
export async function consoleLine(door: Door, slug: string, world: string): Promise<string> {
  const where = consoleFor(door.url, world);
  if (where === undefined) return `console  ${ITS_OWN_NAME}`;
  try {
    return `console  ${consoleUrl(where, slug, await aLoginCode(door))}   (opens within five minutes, once)`;
  } catch (refused) {
    return `console  not available: ${whyNoConsole(refused)}`;
  }
}
