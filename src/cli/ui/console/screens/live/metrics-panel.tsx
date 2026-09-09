/** METRICS: what the call's turns usually cost, and every block the session measured, whole. */

import type { CollectedMetrics, Entry } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { blockShapes, medians, readings, seconds, type MetricsBlock } from "../../lib/metrics";
import type { Shape } from "../../lib/wire";
import { Readings } from "./readings";

/** The medians first, because they are the answer; the blocks under them, because they are the truth. */
export function MetricsPanel({
  metrics,
  entries,
}: {
  metrics: CollectedMetrics;
  entries: Entry[];
}): ReactNode {
  const middle = medians(entries);
  const shapes = blockShapes();
  return (
    <section className="live-panel">
      <h3 className="live-panel-name">METRICS</h3>
      {middle.length === 0 ? (
        <p className="live-panel-empty">Nothing measured yet: the first turn fills this in.</p>
      ) : (
        <Readings
          rows={middle.map((row) => ({
            field: `${row.name} · ${String(row.turns)} turns`,
            value: seconds(row.seconds),
            unit: null,
          }))}
        />
      )}
      {Object.entries(metrics).map(([kind, blocks]) => (
        <Blocks key={kind} kind={kind} blocks={blocks} shape={shapes.get(kind)} />
      ))}
    </section>
  );
}

// Every block of the call, including the ones no turn owns: vad, eot, interruption, realtime and
// avatar measure the session rather than one reply, and this is where they are read.
function Blocks({
  kind,
  blocks,
  shape,
}: {
  kind: string;
  blocks: MetricsBlock[];
  shape: Shape | undefined;
}): ReactNode {
  if (blocks.length === 0) {
    return null;
  }
  return (
    <details className="live-panel-blocks">
      <summary className="live-panel-blocks-summary fixed">
        metrics.{kind} · {blocks.length}
      </summary>
      {blocks.map((block, index) => (
        <Readings key={`${kind}-${String(index)}`} rows={readings(block, shape)} />
      ))}
    </details>
  );
}
