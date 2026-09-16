/** The person's keys, kept for this browser: the one file that touches a browser's storage. */

// localStorage and not sessionStorage: a session is the browser's, not one tab's. A person who
// signs in, or opens a `?login=` link, and then opens the console in a second tab is the same
// person in the second tab — a login code spends once, so a per-tab store left every other tab
// signed out (2026-09-16). Signing out forgets the keys in every tab at once, which is what
// signing out means. Nothing else in this page may reach either storage
// (test/cli/ui/console/the-key-is-never-in-the-page.test.ts).
//
// One key per WORLD. A key opens production or sandbox and never both, so a person looking
// at the other world holds a second key, minted for them by POST /v1/login/env (lib/login.ts).
// Which world the browser is looking at is kept beside them, so a reload lands on the same one.
export type World = "production" | "sandbox";

/** Both of them, named once: anything that acts on every world reads this and not a literal. */
export const WORLDS: readonly World[] = ["production", "sandbox"];

const KEPT_UNDER = "pinecall.key";
const WORLD_UNDER = "pinecall.world";

/** The key this browser holds for that world, or null when it has none. */
export function keptKey(world: World): string | null {
  return window.localStorage.getItem(`${KEPT_UNDER}.${world}`);
}

/** Keep the key a login answered with, for this browser, under the world it opens. */
export function keepKey(world: World, key: string): void {
  window.localStorage.setItem(`${KEPT_UNDER}.${world}`, key);
}

/** Forget one world's key: it died under the page, or the person left. */
export function forgetKey(world: World): void {
  window.localStorage.removeItem(`${KEPT_UNDER}.${world}`);
}

/**
 * Forget every world's key: the person is leaving, not switching.
 *
 * BOTH, and that is the point. A person holds a key per world and the toggle mints the second one
 * from the first, so forgetting only the one on screen leaves the other sitting in this tab — and
 * one toggle walks straight back in as the same person, which is not what anybody means by
 * signing out.
 */
export function forgetEveryKey(): void {
  for (const world of WORLDS) forgetKey(world);
}

/** The world this tab was looking at, or production when it never said. */
export function keptWorld(): World {
  return window.sessionStorage.getItem(WORLD_UNDER) === "sandbox" ? "sandbox" : "production";
}

/** Remember which world the tab looks at, so a reload lands on the same one. */
export function keepWorld(world: World): void {
  window.sessionStorage.setItem(WORLD_UNDER, world);
}
