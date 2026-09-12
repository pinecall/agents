/** The person's key, kept for the life of this tab: the one file that touches a browser's storage. */

// sessionStorage and not localStorage, on purpose: it is one tab's, it dies when the tab closes,
// and it survives a reload — which is exactly the life of a console session. Nothing else in this
// page may reach either storage (test/cli/ui/console/the-key-is-never-in-the-page.test.ts).
const KEPT_UNDER = "pinecall.key";

/** The key this tab logged in with, or null when it has not. */
export function keptKey(): string | null {
  return window.sessionStorage.getItem(KEPT_UNDER);
}

/** Keep the key a login answered with, for this tab. */
export function keepKey(key: string): void {
  window.sessionStorage.setItem(KEPT_UNDER, key);
}

/** Forget it: the key died under the page, or the person left. */
export function forgetKey(): void {
  window.sessionStorage.removeItem(KEPT_UNDER);
}
