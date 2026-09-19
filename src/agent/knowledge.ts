/** What a class reaches its bases through: `this.knowledge.search`, one verb the gateway answers for the call in hand. */

import type { Found } from "../call/call.js";

/** The search: the best chunks of the bases the world attached, for these words, `k` of them. */
export interface Knowledge {
  search(query: string, options?: { k?: number }): Promise<Found[]>;
}
