/** How wide a person left each pane, kept by their browser. A preference, never a credential. */

const UNDER = "pinecall.pane.";

/** The width kept for a pane, or null when none was, it is not a number, or storage is closed. */
export function keptWidth(pane: string): number | null {
  try {
    const kept = Number(window.localStorage.getItem(UNDER + pane));
    return Number.isFinite(kept) && kept > 0 ? kept : null;
  } catch {
    return null;
  }
}

/** Keep a pane's width. A browser that refuses storage keeps nothing, and the page still works. */
export function keepWidth(pane: string, width: number): void {
  try {
    window.localStorage.setItem(UNDER + pane, String(Math.round(width)));
  } catch {
    // A private window: the width lasts as long as the page does.
  }
}

/** Forget a pane's width: it goes back to the one the screen was drawn with. */
export function forgetWidth(pane: string): void {
  try {
    window.localStorage.removeItem(UNDER + pane);
  } catch {
    // Nothing was kept.
  }
}
