/** One turn: who said it and what, the measurements a person watches, and every block behind them. */

import type { CollectedMetrics, Turn } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { blocksFor, headline } from "../../lib/metrics";
import { LogRow } from "./log-row";
import { Readings } from "./readings";

/** A turn of either side. The blocks are the ones the session joined to it by speech_id. */
export function TurnRow({ turn, seq, metrics }: { turn: Turn; seq: number; metrics: CollectedMetrics }): ReactNode {
  const blocks = blocksFor(metrics, turn.speech_id);
  const flags = [
    ...(turn.role === "agent" && turn.interrupted ? ["interrupted"] : []),
    ...(turn.role === "user" && turn.language !== undefined ? [turn.language] : []),
  ];
  return (
    <LogRow
      seq={seq}
      kind="turn"
      tone="turn"
      said={
        <>
          <span className="log-who">{turn.role}</span> · {turn.text}
        </>
      }
      meta={[turn.speech_id, ...flags]}
      chips={headline(turn).map((reading) => `${reading.field} ${reading.value}`)}
    >
      {blocks.length === 0
        ? null
        : blocks.map((block, index) => (
            <section className="log-block" key={`${block.kind}-${String(index)}`}>
              <h4 className="log-block-name fixed">metrics.{block.kind}</h4>
              <Readings rows={block.readings} />
            </section>
          ))}
    </LogRow>
  );
}
