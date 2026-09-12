/** The person's keys, kept for the life of this tab: the one file that touches a browser's storage. */

// sessionStorage and not localStorage, on purpose: it is one tab's, it dies when the tab closes,
// and it survives a reload — which is exactly the life of a console session. Nothing else in this
// page may reach either storage (test/cli/ui/console/the-key-is-never-in-the-page.test.ts).
//
// One key per WORLD. A key opens production or development and never both, so a person looking
// at the other world holds a second key, minted for them by POST /v1/login/env (lib/login.ts).
// Which world the tab is looking at is kept beside them, so a reload lands on the same one.
export type World = "production" | "development";

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

/** The world this tab was looking at, or production when it never said. */
export function keptWorld(): World {
  return window.sessionStorage.getItem(WORLD_UNDER) === "development" ? "development" : "production";
}

/** Remember which world the tab looks at, so a reload lands on the same one. */
export function keepWorld(world: World): void {
  window.sessionStorage.setItem(WORLD_UNDER, world);
}
