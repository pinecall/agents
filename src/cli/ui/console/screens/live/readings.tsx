/** A block of measurements, drawn field by field under livekit's own names. Never renamed here. */

import type { ReactNode } from "react";

import type { Reading } from "../../lib/metrics";

/** Every field a block filled, one row each: the name on the left, what was measured on the right. */
export function Readings({ rows }: { rows: Reading[] }): ReactNode {
  return (
    <dl className="readings">
      {rows.map((reading) => (
        <div className="reading" key={reading.field}>
          <dt className="reading-field fixed">{reading.field}</dt>
          <dd className="reading-value fixed">
            {reading.value}
            {reading.unit !== null && <span className="reading-unit"> {reading.unit}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One measurement small enough to ride on a turn: the field's name and its value, side by side. */
export function Chip({ reading }: { reading: Reading }): ReactNode {
  return (
    <span className="live-chip">
      <span className="live-chip-field fixed">{reading.field}</span>
      <span className="live-chip-value fixed">{reading.value}</span>
    </span>
  );
}
