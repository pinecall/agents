/** The centre column: the call as it happened, row by row, the words being said as its last row, and the list following them down. */

import type { Entry, State } from "@pinecall/protocol";
import { useEffect, useRef, type ReactNode } from "react";

import { LogRow } from "./log-row";
import { MemoryRow, SourcesRow } from "./lookup-rows";
import { ConfirmRow, EventRow, QuietRow, StateRow, SupervisorRow } from "./marks";
import { rowsOf, type Row } from "./timeline-rows";
import { ToolRow } from "./tool-run";
import { TurnRow } from "./turn";

// How close to the end counts as "reading the end": a person who scrolled up to read is left alone.
const NEAR_THE_END_PX = 80;

/** Every row of one call; `after` is what closes the list (a recording). The words being said are its last rows. */
export function Timeline({ entries, state, after }: { entries: Entry[]; state: State; after?: ReactNode }): ReactNode {
  const list = useRef<HTMLDivElement>(null);
  const following = useRef(true);

  // The list follows the call down, unless somebody scrolled up to read: then it waits for them
  // to come back to the end. Read on scroll, applied after every row and every word.
  useEffect(() => {
    const box = list.current;
    if (box !== null && following.current) box.scrollTop = box.scrollHeight;
  }, [entries, state.live.user, state.live.agent]);

  return (
    <div
      className="lv-rows"
      ref={list}
      onScroll={(event) => {
        const box = event.currentTarget;
        following.current = box.scrollHeight - box.scrollTop - box.clientHeight < NEAR_THE_END_PX;
      }}
    >
      {rowsOf(entries, state).map((row) => (
        <RowOf key={`${row.kind}-${String(row.seq)}`} row={row} state={state} />
      ))}
      <Saying said={state.live.user} who="caller" />
      <Saying said={state.live.agent} who="agent" />
      {after}
    </div>
  );
}

function RowOf({ row, state }: { row: Row; state: State }): ReactNode {
  switch (row.kind) {
    case "turn":
      return <TurnRow turn={row.turn} seq={row.seq} metrics={state.metrics} />;
    case "tool":
      return <ToolRow run={row.run} seq={row.seq} />;
    case "state":
      return <StateRow changed={row.changed} cause={row.cause} seq={row.seq} />;
    case "confirm":
      return <ConfirmRow confirm={row.confirm} seq={row.seq} />;
    case "event":
      return <EventRow name={row.name} source={row.source} data={row.data} seq={row.seq} />;
    case "supervisor":
      return <SupervisorRow mark={row.mark} seq={row.seq} />;
    case "memory":
      return <MemoryRow ops={row.ops} seq={row.seq} />;
    case "sources":
      return <SourcesRow sources={row.sources} seq={row.seq} />;
    case "quiet":
      return <QuietRow entries={row.entries} />;
  }
}

// The words on screen right now, from the reducer's own `live`, as the row they are about to
// become. Each word fades in once, when it arrives — which for the agent is when it is spoken —
// and the newest one is lit; keyed by position, so a word already there does not animate again.
function Saying({ said, who }: { said: string | null; who: "caller" | "agent" }): ReactNode {
  if (said === null) return null;
  const spoken = said.split(/\s+/).filter((word) => word !== "");
  return (
    <div className="lv-saying">
      <LogRow
        seq={undefined}
        kind="turn"
        tone="turn"
        who={who}
        said={
          <>
            {spoken.map((word, at) => (
              <span key={at} className={at === spoken.length - 1 ? "lv-word lv-word-now" : "lv-word"}>
                {word}{" "}
              </span>
            ))}
            <span className="lv-caret" aria-hidden />
          </>
        }
      />
    </div>
  );
}
