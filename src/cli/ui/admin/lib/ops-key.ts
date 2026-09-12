/** The box's ops key, kept for the life of this tab: the one file of this page that touches storage. */

// sessionStorage and not localStorage, for the reason the console keeps a person's key there: it
// is one tab's, it dies with the tab, and it survives a reload. Under a name of its OWN, beside
// and never over the console's — the two pages are two origins' worth of separation in one origin,
// and an ops key that landed in `pinecall.key` would be sent to a tenant's door by the other page.
const KEPT_UNDER = "pinecall.ops";

/** The ops key this tab holds, or null when it has none and the login is what renders. */
export function keptOpsKey(): string | null {
  return window.sessionStorage.getItem(KEPT_UNDER);
}

/** Keep the key a login proved, for this tab. It is never written anywhere else. */
export function keepOpsKey(key: string): void {
  window.sessionStorage.setItem(KEPT_UNDER, key);
}

/** Forget it: the key died under the page, or the operator left. */
export function forgetOpsKey(): void {
  window.sessionStorage.removeItem(KEPT_UNDER);
}
