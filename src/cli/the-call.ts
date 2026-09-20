/** Whether a call a person typed exists on this gateway at all, and whether it is still running. */

import { cannotRun } from "./cannot-run.js";
import { asked, Refused, type Door } from "./testing/gateway.js";

/** What the gateway knows about one call, in the two facts a verb decides on. */
export interface Standing {
  /** Whether the call is happening right now: a desk moves this one, a reader reads either. */
  live: boolean;
  /** The last entry's seq — how much log there is to read. */
  lastSeq: number;
}

/**
 * The call's standing, or a refusal naming it. `GET /v1/calls/{call}/state` is the only door that
 * answers 404 for a call nobody here has written, and asking it first is the difference between
 * `pinecall sessions show CA_typo` printing "score not judged" with a zero (production,
 * 2026-09-20) and saying that no such call exists.
 */
export async function standingOf(door: Door, call: string): Promise<Standing> {
  let said: { live?: boolean; last_seq?: number };
  try {
    said = await asked<{ live?: boolean; last_seq?: number }>(door, `/v1/calls/${encodeURIComponent(call)}/state`);
  } catch (refused) {
    if (refused instanceof Refused && refused.status === 404) throw cannotRun(NO_SUCH_CALL(call));
    throw refused;
  }
  return { live: said.live === true, lastSeq: said.last_seq ?? 0 };
}

/** What a call nobody wrote reads as: the id typed back, so a typo is visible in the sentence. */
export const NO_SUCH_CALL = (call: string): string =>
  `no call ${call} on this gateway: \`pinecall sessions list\` names the ones there are`;
