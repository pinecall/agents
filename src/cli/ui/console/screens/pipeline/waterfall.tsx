/** The anatomy of a voice turn, drawn: one bar per stage, the end-to-end wait as the rail. */

import type { ReactNode } from "react";

import { MEASURES } from "../../lib/metrics";
import type { Measured } from "./door";

// The numbers are medians over this agent's recent calls, in seconds, so every label multiplies by
// 1000. A stage nobody measured says so in words — never a zero-width bar, which reads as instant.
// The stages are measured independently by the session and overlap in real time; they are laid
// end to end to show proportion, not to claim they sum to the end-to-end figure.
const NOTES: Record<(typeof MEASURES)[number], string> = {
  end_of_turn_delay: "silence the turn detector waits through before it believes the caller stopped",
  transcription_delay: "from the end of speech to the ear's final transcript",
  llm_node_ttft: "to the model's first token",
  tts_node_ttfb: "to the voice's first audio byte",
  e2e_latency: "what the caller actually waits: their last word to the agent's first audio",
};

const LABELS: Record<(typeof MEASURES)[number], string> = {
  end_of_turn_delay: "end of turn",
  transcription_delay: "transcription",
  llm_node_ttft: "llm ttft",
  tts_node_ttfb: "tts ttfb",
  e2e_latency: "e2e",
};

// MEASURES ends with the total; the bands are what comes before it.
const BANDS = MEASURES.slice(0, -1);
const TOTAL = MEASURES[MEASURES.length - 1] as (typeof MEASURES)[number];

export function Waterfall({ medians, calls, agent }: { medians: Measured[]; calls: number; agent: string }): ReactNode {
  const measured = new Map(medians.map((row) => [row.name, row]));
  const bands = BANDS.map((name) => ({ name, took: measured.get(name)?.seconds ?? null }));
  const summed = bands.reduce((total, band) => total + (band.took ?? 0), 0);
  const whole = measured.get(TOTAL)?.seconds ?? null;
  const rail = Math.max(summed, whole ?? 0);

  if (rail === 0) {
    return <p className="note note-warn">{nothingMeasured(calls, agent)}</p>;
  }

  let offset = 0;
  return (
    <div className="wf">
      {bands.map((band) => {
        const start = offset;
        offset += band.took ?? 0;
        return <Bar key={band.name} label={LABELS[band.name]} note={NOTES[band.name]} seconds={band.took} start={start} rail={rail} />;
      })}
      <Bar label={LABELS[TOTAL]} note={NOTES[TOTAL]} seconds={whole} start={0} rail={rail} total />
      <p className="wf-caption">
        medians over the last {calls} call{calls === 1 ? "" : "s"} · {turnsOf(medians)} turns. The four stages are measured
        independently and overlap in real time; they are laid end to end to show proportion, not to claim
        they add up to e2e.
      </p>
    </div>
  );
}

function Bar({
  label,
  note,
  seconds,
  start,
  rail,
  total,
}: {
  label: string;
  note: string;
  seconds: number | null;
  start: number;
  rail: number;
  total?: boolean;
}): ReactNode {
  return (
    <div className={total ? "wf-row wf-row-total" : "wf-row"}>
      <div className="wf-label" title={note}>
        {label}
      </div>
      <div className="wf-track">
        {seconds === null ? (
          <span className="wf-unmeasured">not yet measured</span>
        ) : (
          <span className="wf-bar" style={{ left: percent(start, rail), width: percent(seconds, rail) }} />
        )}
      </div>
      <div className="wf-value mono">{seconds === null ? "—" : `${Math.round(seconds * 1000)} ms`}</div>
      <p className="wf-note">{note}</p>
    </div>
  );
}

function nothingMeasured(calls: number, agent: string): string {
  if (calls === 0) {
    return `no call stored for ${agent} yet — place one and the bars appear.`;
  }
  return `${calls} stored call${calls === 1 ? "" : "s"} for ${agent}, and not one turn carries a latency — a text session measures none.`;
}

function turnsOf(medians: Measured[]): number {
  return Math.max(0, ...medians.map((row) => row.turns));
}

function percent(value: number, rail: number): string {
  return `${Math.max((value / rail) * 100, value > 0 ? 0.6 : 0)}%`;
}
