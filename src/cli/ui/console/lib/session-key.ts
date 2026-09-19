/** The person's key, kept for this browser: the one file that touches a browser's storage. */

// localStorage and not sessionStorage: a session is the browser's, not one tab's. A person who
// signs in, or opens a `?login=` link, and then opens the console in a second tab is the same
// person in the second tab — a login code spends once, so a per-tab store left every other tab
// signed out (2026-09-16). Signing out forgets the key in every tab at once, which is what
// signing out means. Nothing else in this page may reach either storage
// (test/cli/ui/pages/the-key-is-never-in-the-page.test.ts).
//
// One key: the person's own. It is not a world's — the page names the world on every request
// (shared/api.ts), and the gateway lets production through while the person's row opens it.
const KEPT_UNDER = "pinecall.key";

/** The key this browser holds, or null when it has none. */
export function keptKey(): string | null {
  return window.localStorage.getItem(KEPT_UNDER);
}

/** Keep the key a login answered with, for this browser. */
export function keepKey(key: string): void {
  window.localStorage.setItem(KEPT_UNDER, key);
}

/** Forget the key: it died under the page, or the person left. */
export function forgetKey(): void {
  window.localStorage.removeItem(KEPT_UNDER);
}

const CORNER_UNDER = "pinecall.corner";

/**
 * Whose sandbox copy this tab looks at, when an admin opened a colleague's; null for their own.
 * One tab's, on purpose: a second tab opens on the person's own copy.
 */
export function keptCorner(): string | null {
  return window.sessionStorage.getItem(CORNER_UNDER);
}

/** Remember whose copy the tab looks at, or forget it with null: back to the person's own. */
export function keepCorner(corner: string | null): void {
  if (corner === null) window.sessionStorage.removeItem(CORNER_UNDER);
  else window.sessionStorage.setItem(CORNER_UNDER, corner);
}
