/** What this terminal calls itself: the label a key minted for it is revoked under, on its own. */

import { hostname } from "node:os";

/** The machine's name, as a card that signs it in and a key minted for it both show it. */
export function thisMachine(): string {
  try {
    return hostname();
  } catch {
    return "cli";
  }
}
