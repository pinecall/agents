/** What a simulated call sounds like from this terminal: the log, printed as it lands. */

import type { CamelEvent } from "../../client/index.js";
import { lineFor, metricsLine } from "../view.js";
import type { Entry, Spoken } from "./gateway.js";

// How long a written call is left quiet before the caller says the next thing, and how long one
// turn may take: the simulation's own two clocks, kept beside what waits on them.
export const SETTLE_MS = 400;
export const A_TURN_MAY_TAKE_MS = 30_000;

// The call's log as this terminal hears it: printed as it lands, and quiet when the app has
// finished reacting. Everything the simulation knows about where the call is, it knows from here —
// including the transcript the caller model is handed, which is the log's own turns and not a
// second copy this process kept.
export class Heard {
  call: string | undefined;
  agentTurns = 0;
  /** Whether the call has been hung up: by the agent, by the app, or by a person who stopped it. */
  over = false;
  readonly said: Spoken[] = [];
  private last = Date.now();

  constructor(
    private readonly out: NodeJS.WritableStream,
    private readonly opened?: ((call: string) => void) | undefined,
  ) {}

  /** One entry: remembered, and printed when it is a line of the conversation rather than wiring. */
  absorb(entry: Entry): void {
    this.last = Date.now();
    if (typeof entry.call === "string" && this.call === undefined) {
      this.call = entry.call;
      this.opened?.(entry.call);
    }
    if (entry.type === "turn.agent") this.agentTurns += 1;
    // The one entry that says nothing more will be answered. A caller that did not read it went on
    // sending its remaining turns down a socket the gateway had already sealed, thirty seconds of
    // waiting each (2026-09-21, the console's Stop on a written simulation).
    if (entry.type === "call.ended") this.over = true;
    if (entry.type === "turn.user" || entry.type === "turn.agent") {
      this.said.push({
        who: entry.type === "turn.agent" ? "agent" : "caller",
        said: String(entry.data["text"] ?? ""),
      });
    }
    // Both sides are printed off the log and never off what this process sent: on a spoken call
    // the caller's own turn is what the STT heard, which is the line that matters.
    const line = lineFor(entry as unknown as CamelEvent);
    if (line === null) return;
    const metrics = entry.type === "turn.agent"
      ? `  ${metricsLine(entry.data["metrics"] as Record<string, unknown> | undefined)}`
      : "";
    this.out.write(`${line.mark} ${line.text}${metrics}\n`);
  }

  /** Waits until the agent has spoken again, and then until the app has finished reacting. */
  async answered(said: number): Promise<void> {
    const deadline = Date.now() + A_TURN_MAY_TAKE_MS;
    while (this.agentTurns === said && !this.over && Date.now() < deadline) await after(SETTLE_MS / 4);
    await this.quiet();
  }

  /** Waits until nothing has been written for a moment: the app has answered and re-rendered. */
  async quiet(): Promise<void> {
    const deadline = Date.now() + A_TURN_MAY_TAKE_MS;
    while (Date.now() - this.last < SETTLE_MS && Date.now() < deadline) await after(SETTLE_MS / 4);
  }
}

export function after(ms: number): Promise<void> {
  return new Promise((wake) => setTimeout(wake, ms));
}
