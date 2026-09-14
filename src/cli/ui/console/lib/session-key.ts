/** The person's keys, kept for the life of this tab: the one file that touches a browser's storage. */

// sessionStorage and not localStorage, on purpose: it is one tab's, it dies when the tab closes,
// and it survives a reload — which is exactly the life of a console session. Nothing else in this
// page may reach either storage (test/cli/ui/console/the-key-is-never-in-the-page.test.ts).
//
// One key per WORLD. A key opens production or sandbox and never both, so a person looking
// at the other world holds a second key, minted for them by POST /v1/login/env (lib/login.ts).
// Which world the tab is looking at is kept beside them, so a reload lands on the same one.
export type World = "production" | "sandbox";

/** Both of them, named once: anything that acts on every world reads this and not a literal. */
export const WORLDS: readonly World[] = ["production", "sandbox"];

const KEPT_UNDER = "pinecall.key";
const WORLD_UNDER = "pinecall.world";

/** The key this tab holds for that world, or null when it has none. */
export function keptKey(world: World): string | null {
  return window.sessionStorage.getItem(`${KEPT_UNDER}.${world}`);
}

/** Keep the key a login answered with, for this tab, under the world it opens. */
export function keepKey(world: World, key: string): void {
  window.sessionStorage.setItem(`${KEPT_UNDER}.${world}`, key);
}

/** Forget one world's key: it died under the page, or the person left. */
export function forgetKey(world: World): void {
  window.sessionStorage.removeItem(`${KEPT_UNDER}.${world}`);
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
