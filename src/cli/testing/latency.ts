/** The latency a golden was answered with: the median of every turn's own metrics entry. */

import { TURN_METRICS } from "../view.js";
import type { Entry } from "./gateway.js";

/** The three numbers a report prints per golden, in seconds, as livekit measured each turn. */
export type Medians = Partial<Record<(typeof TURN_METRICS)[number], number>>;

/**
 * The medians of one call. The median and not the mean: one cold first turn would drag an average
 * of four turns somewhere no caller ever waited, and the number here is meant to be the one a
 * typical caller felt. Nothing is computed that the log does not already carry — a metric the
 * session never measured is absent from the answer rather than reported as a zero.
 */
export function mediansOf(entries: Entry[]): Medians {
  const medians: Medians = {};
  for (const name of TURN_METRICS) {
    const measured = takenPerTurn(entries, name);
    if (measured.length > 0) medians[name] = median(measured);
  }
  return medians;
}

/** The medians on one line, in the order a person reads them: the wait first, then where it went. */
export function latencyLine(medians: Medians): string {
  const parts = TURN_METRICS.filter((name) => medians[name] !== undefined).map(
    (name) => `${name} ${Math.round(medians[name]! * 1000)}ms`,
  );
  return parts.join(" · ");
}

// Every finished agent turn carries the block livekit measured for it under livekit's own field
// names, which is where these three are read from — never from a second, summarised copy.
function takenPerTurn(entries: Entry[], name: string): number[] {
  const taken: number[] = [];
  for (const entry of entries) {
    if (entry.type !== "turn.agent") continue;
    const metrics = entry.data["metrics"];
    const value = typeof metrics === "object" && metrics !== null
      ? (metrics as Record<string, unknown>)[name]
      : undefined;
    if (typeof value === "number") taken.push(value);
  }
  return taken;
}

function median(values: number[]): number {
  const sorted = [...values].sort((one, two) => one - two);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
