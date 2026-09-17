/** A block of measurements, drawn field by field under livekit's own names. Never renamed here. */

import type { ReactNode } from "react";

import type { Reading } from "../../lib/metrics";
import { KV } from "../../ui";

/** Every field a block filled, one row each: the name on the left, what was measured on the right. */
export function Readings({ rows }: { rows: Reading[] }): ReactNode {
  return (
    <div className="lv-readings">
      {rows.map((reading) => (
        <KV key={reading.field} label={reading.field} keyWidth={150}>
          {reading.value}
          {reading.unit !== null && <span className="lv-seen"> {reading.unit}</span>}
        </KV>
      ))}
    </div>
  );
}
