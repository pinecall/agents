/** Seeds each eval call with its golden's state and checks the order afterwards. */

import type { Call as SdkCall } from "../../client/index.js";

import type { Snapshot } from "../../agent/state.js";
import type { EvalRun } from "./gateway.js";
import type { Golden } from "./goldens.js";

/** Error when calls arrived in a different order than the run opened them. */
export const OUT_OF_ORDER =
  "the calls did not arrive in the order the run opened them: {said} took the state of {seeded}";

/**
 * Hands each starting eval call its golden's state through mount's `opening` seam (between `onCall`
 * and the first render). Seeding from the log's `state.changed` would render intermediate states.
 *
 * Calls are matched by order: the runner runs one conversation at a time, models outermost.
 * `mismatched` verifies that order afterwards.
 */
export class Openings {
  private waiting: Golden[] = [];
  private readonly seeded: string[] = [];

  /** Queue the goldens once per model, in the runner's order. */
  expects(goldens: Golden[], models: number): void {
    this.waiting = Array.from({ length: Math.max(models, 1) }, () => goldens).flat();
    this.seeded.length = 0;
  }

  /** The next golden's state, or undefined for a call not opened by a run. */
  opening(call: SdkCall): Snapshot | undefined {
    if (call.run === null) return undefined;
    const golden = this.waiting.shift();
    if (golden === undefined) return undefined;
    this.seeded.push(golden.name);
    return golden.state;
  }

  /** An error message if any call got another golden's state. */
  mismatched(run: EvalRun): string | undefined {
    const wrong = run.calls.findIndex((opened, index) => opened.golden !== this.seeded[index]);
    if (wrong === -1) return undefined;
    return OUT_OF_ORDER.replace("{said}", run.calls[wrong]!.golden).replace(
      "{seeded}",
      this.seeded[wrong] ?? "no golden at all",
    );
  }
}
