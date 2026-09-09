/** One turn: what was said, the five measurements a person watches, and every block behind them. */

import type { CollectedMetrics, Turn } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { blocksFor, headline } from "../../lib/metrics";
import { Chip, Readings } from "./readings";

/** A turn of either side. The blocks are the ones the session joined to it by speech_id. */
export function TurnRow({ turn, metrics }: { turn: Turn; metrics: CollectedMetrics }): ReactNode {
  const blocks = blocksFor(metrics, turn.speech_id);
  return (
    <article className={`turn turn-${turn.role}`}>
      <p className="turn-said">{turn.text}</p>
      <div className="turn-chips">
        <span className="turn-speech fixed">{turn.speech_id}</span>
        {headline(turn).map((reading) => (
          <Chip key={reading.field} reading={reading} />
        ))}
        {turn.role === "agent" && turn.interrupted ? <span className="turn-flag">interrupted</span> : null}
        {turn.role === "user" && turn.language !== undefined ? (
          <span className="turn-flag">{turn.language}</span>
        ) : null}
      </div>
      {blocks.length === 0 ? null : (
        <details className="turn-blocks">
          <summary className="turn-blocks-summary">
            {blocks.map((block) => `metrics.${block.kind}`).join(" · ")}
          </summary>
          {blocks.map((block, index) => (
            <section className="turn-block" key={`${block.kind}-${String(index)}`}>
              <h4 className="turn-block-name fixed">metrics.{block.kind}</h4>
              <Readings rows={block.readings} />
            </section>
          ))}
        </details>
      )}
    </article>
  );
}
