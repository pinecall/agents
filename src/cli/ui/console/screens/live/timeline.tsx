/** The centre column: the call as it happened, row by row, with the words being said at the foot. */

import type { Entry, State } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { MemoryRow, SourcesRow } from "./lookup-rows";
import { ConfirmRow, EventRow, QuietRow, StateRow, SupervisorRow } from "./marks";
import { rowsOf, type Row } from "./timeline-rows";
import { ToolRow } from "./tool-run";
import { TurnRow } from "./turn";

/** Every row of one call; `after` is what closes the list (a recording). The interim words are the strip at the foot. */
export function Timeline({ entries, state, after }: { entries: Entry[]; state: State; after?: ReactNode }): ReactNode {
  const saying = state.live.user !== null || state.live.agent !== null;
  return (
    <>
      <div className="lv-rows">
        {rowsOf(entries, state).map((row) => (
          <RowOf key={`${row.kind}-${String(row.seq)}`} row={row} state={state} />
        ))}
        {after}
      </div>
      {saying && (
        <div className="lv-foot">
          <Interim said={state.live.user} whose="caller" />
          <Interim said={state.live.agent} whose="agent" />
        </div>
      )}
    </>
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

// The words on screen right now, from the reducer's own `live`: a caret while they are still
// arriving, gone the moment the turn they belong to is final.
function Interim({ said, whose }: { said: string | null; whose: string }): ReactNode {
  return (
    <p className="lv-foot-line">
      {whose} <span className="lv-foot-said">{said ?? "…"}</span>
      {said !== null && <span className="lv-foot-caret" aria-hidden />}
    </p>
  );
}
