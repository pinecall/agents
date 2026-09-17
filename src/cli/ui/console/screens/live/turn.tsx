/** One turn: who said it and what, the measurements a person watches, and every block behind them. */

import type { CollectedMetrics, Turn } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { blocksFor, headline } from "../../lib/metrics";
import { LogRow } from "./log-row";
import { Readings } from "./readings";

// The five headline measures as a note line says them: livekit's names are the expander's.
const SHORT: Record<string, string> = {
  transcription_delay: "stt",
  end_of_turn_delay: "eot",
  llm_node_ttft: "ttft",
  tts_node_ttfb: "ttfb",
  e2e_latency: "e2e",
};

/** A turn of either side. The blocks are the ones the session joined to it by speech_id. */
export function TurnRow({ turn, seq, metrics }: { turn: Turn; seq: number; metrics: CollectedMetrics }): ReactNode {
  const blocks = blocksFor(metrics, turn.speech_id);
  const readings = headline(turn).map((reading) => `${SHORT[reading.field] ?? reading.field} ${reading.value}`);
  const flags = [
    ...(turn.role === "agent" && turn.interrupted ? ["interrupted"] : []),
    ...(turn.role === "user" && turn.language !== undefined && turn.language !== null ? [turn.language] : []),
  ];
  const note = turn.role === "user" ? [...readings, turn.speech_id, ...flags] : [...readings, ...flags];
  return (
    <LogRow seq={seq} kind="turn" tone="turn" who={turn.role === "agent" ? "agent" : "caller"} said={turn.text} note={note}>
      {blocks.length === 0
        ? null
        : blocks.map((block, index) => (
            <section key={`${block.kind}-${String(index)}`}>
              <h4 className="lv-block-name">metrics.{block.kind}</h4>
              <Readings rows={block.readings} />
            </section>
          ))}
    </LogRow>
  );
}
