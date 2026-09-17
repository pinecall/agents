/** A block of measurements, drawn field by field under livekit's own names. Never renamed here. */

import type { ReactNode } from "react";

import type { Reading } from "../../lib/metrics";

// What a reading IS, as opposed to what it is measured in: said by the value itself, so not drawn.
const NOT_A_UNIT = new Set(["tag", "name", "id", "flag"]);

/** Every field a block filled, one row each: the name on the left, what was measured on the right. */
export function Readings({ rows }: { rows: Reading[] }): ReactNode {
  return (
    <div className="lv-readings">
      {rows.map((reading) => (
        <div key={reading.field} className="lv-reading">
          <span className="lv-reading-name">{reading.field}</span>
          <span className="lv-reading-value" title={String(reading.value)}>
            {rounded(String(reading.value))}
            {reading.unit !== null && !NOT_A_UNIT.has(reading.unit) && <span className="lv-seen"> {reading.unit}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// A float is read to the millisecond; the whole of it stays one hover away.
function rounded(value: string): string {
  return /^-?\d+\.\d{4,}$/.test(value) ? Number(value).toFixed(3) : value;
}
