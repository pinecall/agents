/** The measures of one call's latency, median and max — the terminal's numbers, on screen. */

import type { ReactNode } from "react";

import { seconds, type Median } from "../../lib/metrics";

// Nothing new is measured here: every value is the median or the max of the per-turn chips
// `pinecall-runtime sessions show <id>` already prints, in the same seconds, so the two readings
// can be held side by side and disagreeing would be a bug.
export function LatencyStrip({ rows }: { rows: Median[] }): ReactNode {
  if (rows.length === 0) {
    return (
      <p className="note">
        No turn in this session carried a metric — a chat session times nothing, and a voice call that dropped
        before its first answer has nothing to time.
      </p>
    );
  }
  return (
    <div className="strip">
      {rows.map((row) => (
        <div key={row.name} className="strip-cell">
          <div className="strip-leg">{row.name}</div>
          <div className="strip-median">{seconds(row.seconds)}</div>
          <div className="strip-foot">
            <span>
              max <span className="strip-max">{seconds(row.max)}</span>
            </span>
            <span className="faint">n={row.turns}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
