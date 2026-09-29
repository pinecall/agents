/** The `console` line `pinecall start` prints: a signed-in console URL, or why there is none. */

import { asked, Refused, type Door } from "./testing/gateway.js";

const NO_SUCH_DOOR = 404;

/**
 * Console URL carrying a one-use login code (valid five minutes), so the browser gets its own key
 * and this process's key never appears in a URL.
 */
export function consoleUrl(where: string, slug: string | undefined, code: string): string {
  const at = slug === undefined ? "/" : `/a/${encodeURIComponent(slug)}`;
  return `${where.replace(/\/$/, "")}${at}?login=${encodeURIComponent(code)}`;
}

// A 404 on the login-code door means the gateway predates this CLI.
const OLDER_GATEWAY =
  "this gateway has no login-code door, so it is older than this CLI. Restart it: it serves the console too, and that will be stale as well.";

/** Explain why no console URL could be made. */
export function whyNoConsole(refused: unknown): string {
  if (refused instanceof Refused) {
    // The message carries the gateway's explanation, not just the status.
    return refused.status === NO_SUCH_DOOR ? OLDER_GATEWAY : refused.message;
  }
  return refused instanceof Error ? refused.message : String(refused);
}

/** Mint a one-use login code for this terminal's key. */
export async function aLoginCode(door: Door): Promise<string> {
  return (await asked<{ code: string }>(door, "/v1/login/codes", { method: "POST", body: {} })).code;
}

/** The `console` line: a signed-in URL on the door's own instance, or why there is none. */
export async function consoleLine(door: Door, slug: string): Promise<string> {
  try {
    return `console  ${consoleUrl(door.url, slug, await aLoginCode(door))}   (opens within five minutes, once)`;
  } catch (refused) {
    return `console  not available: ${whyNoConsole(refused)}`;
  }
}
