/** METRICS: what the call's turns usually cost, as bars, and every block the session measured, whole. */

import type { CollectedMetrics, Entry } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { blockShapes, medians, readings, seconds, type MetricsBlock } from "../../lib/metrics";
import type { Shape } from "../../lib/wire";
import { Bar, SectionLabel } from "../../ui";
import { Readings } from "./readings";

/** The medians first, because they are the answer; the blocks under them, because they are the truth. */
export function MetricsPanel({ metrics, entries }: { metrics: CollectedMetrics; entries: Entry[] }): ReactNode {
  const middle = medians(entries);
  const longest = Math.max(...middle.map((row) => row.seconds), 0);
  const shapes = blockShapes();
  return (
    <>
      <SectionLabel ruled>Metrics</SectionLabel>
      <div className="lv-pane-body">
        {middle.length === 0 && <div className="lv-sub">Nothing measured yet: the first turn fills this in.</div>}
        {middle.map((row) => (
          <div className="lv-meter" key={row.name} title={`median over ${String(row.turns)} turns`}>
            <span className="lv-meter-name">{row.name}</span>
            <Bar share={longest === 0 ? 0 : row.seconds / longest} />
            <span className="lv-meter-value">{seconds(row.seconds)}</span>
          </div>
        ))}
        {Object.entries(metrics).map(([kind, blocks]) => (
          <Blocks key={kind} kind={kind} blocks={blocks} shape={shapes.get(kind)} />
        ))}
      </div>
    </>
  );
}

// Every block of the call, including the ones no turn owns: vad, eot, interruption, realtime and
// avatar measure the session rather than one reply, and this is where they are read.
function Blocks({ kind, blocks, shape }: { kind: string; blocks: MetricsBlock[]; shape: Shape | undefined }): ReactNode {
  if (blocks.length === 0) {
    return null;
  }
  return (
    <details className="lv-blocks">
      <summary>
        metrics.{kind} · {blocks.length}
      </summary>
      {blocks.map((block, index) => (
        <Readings key={`${kind}-${String(index)}`} rows={readings(block, shape)} />
      ))}
    </details>
  );
}
