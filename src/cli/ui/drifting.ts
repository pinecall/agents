/** The console's own door to `runs drift`: each judge's held-rate over two windows, counted here. */

import { A_WINDOW_OF_CALLS, THRESHOLD, theDrift, type Drift } from "../runs/drift.js";
import type { Door } from "../testing/gateway.js";
import { anObject, aString, maybeNumber } from "./asked.js";

/** The two windows, in seconds, as the page asks for them, and what came of them. */
export interface Drifted {
  agent: string;
  window: number;
  baseline: number;
  threshold: number;
  drift: Drift;
}

/** What the server needs from the drift door. */
export interface Drifting {
  read(asked: unknown): Promise<Drifted>;
}

/** A week against a month: the windows `pinecall runs drift` has when nobody names one. */
const A_WEEK = 7 * 24 * 60 * 60;
const A_MONTH = 30 * 24 * 60 * 60;

/**
 * One `Drifting` for the life of a `pinecall run`. Nothing here is the console's own work: it is
 * the very `theDrift` the verb runs, in the process that already holds the key, because reading
 * two hundred calls and their scores is two hundred round trips and a browser should make none of
 * them. A held-rate is a count of the verdicts the log already carries — nothing is judged again.
 */
export function driftingFrom(door: Door, now: () => number = () => Date.now() / 1000): Drifting {
  return {
    async read(asked: unknown): Promise<Drifted> {
      const given = anObject(asked, "a drift");
      const agent = aString(given, "agent");
      const window = maybeNumber(given, "window", 60, A_MONTH * 12) ?? A_WEEK;
      const baseline = maybeNumber(given, "baseline", 60, A_MONTH * 12) ?? A_MONTH;
      const threshold = maybeNumber(given, "threshold", 0, 100) ?? THRESHOLD;
      const drift = await theDrift(door, {
        agent,
        window,
        baseline,
        threshold,
        limit: A_WINDOW_OF_CALLS,
        now: now(),
      });
      return { agent, window, baseline, threshold, drift };
    },
  };
}
