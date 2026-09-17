/** The Inspector: one call read off its log while it happens — its figures, its turns, its tools, its state. */

import type { State, Turn } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { euros } from "../../lib/format";
import { medians, seconds } from "../../lib/metrics";
import type { Connection } from "../../lib/stream";
import { useOrg } from "../../lib/org";
import { Pill, SectionLabel } from "../../ui";
import { useWatchedCall } from "../live/use-watched-call";
import "./inspector.css";

/**
 * The pane beside Talk and Chat. It reads the call this tab opened; before there is one, the last
 * call this agent had, so the pane is never a blank column — and says which of the two it is.
 */
export function Inspector({ agent, call }: { agent: string; call: string | null }): ReactNode {
  const { lines } = useOrg();
  const last = lines.find((line) => line.agent === agent)?.call ?? null;
  const shown = call ?? last;
  return (
    <aside className="inspector" aria-label="Inspector">
      {shown === null ? (
        <>
          <InspectorHead connection={null} />
          <p className="inspector-quiet">Nothing to read yet: the first call this agent takes is read here as it happens.</p>
        </>
      ) : (
        <Reading key={shown} call={shown} yours={call !== null} />
      )}
    </aside>
  );
}

function InspectorHead({ connection }: { connection: Connection | null }): ReactNode {
  return (
    <div className="inspector-head">
      <span className="inspector-title">Inspector</span>
      <span className="inspector-standing">{standing(connection)}</span>
    </div>
  );
}

function standing(connection: Connection | null): ReactNode {
  switch (connection) {
    case "live":
      return <Pill tone="green">reading the log</Pill>;
    case "connecting":
      return <Pill tone="muted">opening the log</Pill>;
    case "reconnecting":
      return <Pill tone="amber">reconnecting</Pill>;
    case "ended":
      return <Pill tone="muted">call ended</Pill>;
    default:
      return <Pill tone="muted">no call yet</Pill>;
  }
}

function Reading({ call, yours }: { call: string; yours: boolean }): ReactNode {
  const watched = useWatchedCall(call);
  const { state } = watched;
  const seen = new Set<number>();
  // A log re-read from its start hands the same entries again; a seq is counted once.
  const measured = medians(watched.entries.filter((entry) => (seen.has(entry.seq) ? false : (seen.add(entry.seq), true))));
  const median = (name: string): string => {
    const found = measured.find((one) => one.name === name);
    return found === undefined ? "—" : seconds(found.seconds);
  };
  const tokens = tokensOf(state);
  const figures: [string, string][] = [
    ["Turns", String(state.turns.length)],
    ["ttft", median("llm_node_ttft")],
    ["e2e", median("e2e_latency")],
    ["Cost", euros(state.cost?.eur)],
    ["Tokens in", grouped(tokens.in)],
    ["Tokens out", grouped(tokens.out)],
  ];
  const fields = Object.keys(state.app_state).sort();

  return (
    <>
      <InspectorHead connection={watched.connection} />
      <SectionLabel>{yours ? "This session" : "Last session"}</SectionLabel>
      <div className="inspector-figures">
        {figures.map(([label, value]) => (
          <div key={label}>
            <div className="inspector-figure-label">{label}</div>
            <div className="inspector-figure">{value}</div>
          </div>
        ))}
      </div>
      {!yours && <p className="inspector-call">{call}</p>}

      <SectionLabel ruled>Turns</SectionLabel>
      <div className="inspector-turns">
        {state.turns.length === 0 && <p className="inspector-none">No turn yet.</p>}
        {state.turns.map((turn, index) => (
          <div className="inspector-turn" key={`${turn.speech_id}-${index}`}>
            <span className={turn.role === "agent" ? "inspector-who inspector-who-agent" : "inspector-who"}>{turn.role === "agent" ? "agent" : "caller"}</span>
            <span className="inspector-turn-body">
              <span className="inspector-turn-text">{turn.text}</span>
              <span className="inspector-turn-meta">{metaOf(turn)}</span>
            </span>
          </div>
        ))}
      </div>

      <SectionLabel ruled>Tool calls</SectionLabel>
      <div className="inspector-tools">
        {state.tools.length === 0 && <p className="inspector-none">No tool has run.</p>}
        {state.tools.map((run) => (
          <div className="inspector-tool" key={run.call_id}>
            <div className="inspector-tool-name">{run.name}</div>
            <div className="inspector-tool-args">{argumentsOf(run.arguments)}</div>
            <div className={run.status === "failed" ? "inspector-tool-result inspector-tool-failed" : run.status === "running" ? "inspector-tool-result inspector-tool-running" : "inspector-tool-result"}>
              {run.status === "failed" ? (run.error ?? "failed") : run.status === "running" ? "running…" : `ok${run.summary ? ` · ${run.summary}` : ""}`}
            </div>
          </div>
        ))}
      </div>

      <SectionLabel ruled>State</SectionLabel>
      <div className="inspector-state">
        {fields.length === 0 && <p className="inspector-none">The app has declared no state yet.</p>}
        {fields.map((name) => (
          <div className="inspector-field" key={name}>
            <span className="inspector-field-key">{name}</span>
            <span className="inspector-field-value">{said(state.app_state[name])}</span>
          </div>
        ))}
      </div>
      {watched.error !== null && <p className="inspector-refused">{watched.error}</p>}
    </>
  );
}

// What the caller heard ("ttft · e2e") and what the ear took ("stt · the speech id"), per turn.
function metaOf(turn: Turn): string {
  if (turn.role === "agent") {
    const parts: string[] = [];
    if (typeof turn.metrics.llm_node_ttft === "number") parts.push(`ttft ${seconds(turn.metrics.llm_node_ttft)}`);
    if (typeof turn.metrics.e2e_latency === "number") parts.push(`e2e ${seconds(turn.metrics.e2e_latency)}`);
    if (turn.interrupted) parts.push("interrupted");
    return parts.join(" · ");
  }
  const parts: string[] = [];
  if (typeof turn.metrics.transcription_delay === "number") parts.push(`stt ${seconds(turn.metrics.transcription_delay)}`);
  parts.push(turn.speech_id);
  return parts.join(" · ");
}

// Tokens read by the model, cached ones included — what the cache saves is still context — and
// the tokens it wrote.
function tokensOf(state: State): { in: number; out: number } {
  let read = 0;
  let wrote = 0;
  for (const row of state.usage) {
    if (row.type !== "llm_usage") continue;
    read += (row.input_tokens ?? 0) + (row.input_cached_tokens ?? 0);
    wrote += row.output_tokens ?? 0;
  }
  return { in: read, out: wrote };
}

function grouped(count: number): string {
  return count.toLocaleString("en-US").replace(/,/g, " ");
}

function argumentsOf(values: Record<string, unknown>): string {
  const pairs = Object.entries(values).map(([key, value]) => `${key}=${said(value)}`);
  return pairs.length === 0 ? "no arguments" : pairs.join(" · ");
}

function said(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
