/** The conversation as bubbles: what you wrote on the right, what the agent answered on the left, a tool between. */

import type { ReactNode } from "react";

import { rowsOf } from "../live/timeline-rows";
import { useWatchedCall } from "../live/use-watched-call";

// The column says who: the person typing is YOU; the agent is the agent; a tool is the tool's name.
const WHO = { user: "you", agent: "agent" } as const;

/** Every turn of the call so far, and every tool the model called between them, from the call's own log. */
export function Bubbles({ call }: { call: string }): ReactNode {
  const watched = useWatchedCall(call);
  const rows = rowsOf(watched.entries, watched.state);
  return (
    <div className="chat-lines">
      {rows.map((row) => {
        if (row.kind === "turn") {
          return (
            <div className={`chat-line chat-line-${row.turn.role}`} key={`turn-${String(row.seq)}`}>
              <span className="chat-who fixed">{WHO[row.turn.role]}</span>
              <span className="chat-bubble">{row.turn.text}</span>
            </div>
          );
        }
        if (row.kind === "tool") {
          return (
            <div className="chat-line chat-line-tool" key={`tool-${String(row.seq)}`}>
              <span className="chat-who fixed">tool</span>
              <span className="chat-bubble fixed">
                {row.run.name} → {row.run.error ?? row.run.summary ?? (row.run.status === "running" ? "…" : "done")}
              </span>
            </div>
          );
        }
        return null;
      })}
      {watched.state.live.agent !== null && (
        <div className="chat-line chat-line-agent">
          <span className="chat-who fixed">{WHO.agent}</span>
          <span className="chat-bubble">{watched.state.live.agent}</span>
        </div>
      )}
      {watched.error !== null && <p className="note note-warn">{watched.error}</p>}
    </div>
  );
}
