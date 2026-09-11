/** Which golden's state a starting call opens in, and the check that it was the right one. */

import type { Call as SdkCall } from "../../client/index.js";

import type { Snapshot } from "../../agent/state.js";
import type { EvalRun } from "./gateway.js";
import type { Golden } from "./goldens.js";

/** What to say when the calls did not arrive in the order the run says it opened them in. */
export const OUT_OF_ORDER =
  "the calls did not arrive in the order the run opened them: {said} took the state of {seeded}";

/**
 * The states a run is about to open, handed out as its calls start.
 *
 * The seed cannot come off the log: `session.configure {state}` writes `state.changed` into the
 * call and stops there — the tenant's class is another process and nothing on the wire moves it —
 * and by the time that entry reaches this terminal the bridge is re-rendering on every field, so
 * restoring three fields would show the model two states the call was never in. `mount`'s own
 * `opening` seam is the moment between `onCall` and the first render, and this is what fills it.
 *
 * Which state belongs to which call is the runner's order: one run at a time (a second is refused
 * with 409) and one conversation at a time inside it, models outermost. `mismatched` checks that
 * afterwards against what the run says it opened, so a wrong seed is a loud line and never a
 * golden that quietly tested something else.
 */
export class Openings {
  private waiting: Golden[] = [];
  private readonly seeded: string[] = [];

  /** The goldens this run will open, once per model, in the order the runner will walk them. */
  expects(goldens: Golden[], models: number): void {
    this.waiting = Array.from({ length: Math.max(models, 1) }, () => goldens).flat();
    this.seeded.length = 0;
  }

  /** The state this starting call opens in: the next golden's, or none when no run opened it. */
  opening(call: SdkCall): Snapshot | undefined {
    if (call.run === null) return undefined;
    const golden = this.waiting.shift();
    if (golden === undefined) return undefined;
    this.seeded.push(golden.name);
    return golden.state;
  }

  /** The sentence to print when a call took a state that was not its golden's, or nothing. */
  mismatched(run: EvalRun): string | undefined {
    const wrong = run.calls.findIndex((opened, index) => opened.golden !== this.seeded[index]);
    if (wrong === -1) return undefined;
    return OUT_OF_ORDER.replace("{said}", run.calls[wrong]!.golden).replace(
      "{seeded}",
      this.seeded[wrong] ?? "no golden at all",
    );
  }
}
