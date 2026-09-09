/** The centre column: the call as it happened, row by row, with the words being said at the foot. */

import type { Entry, State } from "@pinecall/protocol";
import type { ReactNode } from "react";

import { MemoryRow, SourcesRow } from "./fill-rows";
import { ConfirmRow, EventRow, QuietRow, StateRow, SupervisorRow } from "./marks";
import { rowsOf, type Row } from "./timeline-rows";
import { ToolRow } from "./tool-run";
import { TurnRow } from "./turn";

/** Every row of one call. The interim words are not a row: they are the line at the bottom. */
export function Timeline({ entries, state }: { entries: Entry[]; state: State }): ReactNode {
  return (
    <div className="live-timeline">
      {rowsOf(entries, state).map((row) => (
        <RowOf key={`${row.kind}-${String(row.seq)}`} row={row} state={state} />
      ))}
      <Interim said={state.live.user} whose="user" />
      <Interim said={state.live.agent} whose="agent" />
    </div>
  );
}

function RowOf({ row, state }: { row: Row; state: State }): ReactNode {
  switch (row.kind) {
    case "turn":
      return <TurnRow turn={row.turn} metrics={state.metrics} />;
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

// The words on screen right now, from the reducer's own `live`: grey while they are still a guess,
// gone the moment the turn they belong to is final.
function Interim({ said, whose }: { said: string | null; whose: string }): ReactNode {
  if (said === null) {
    return null;
  }
  return <p className={`interim interim-${whose}`}>{said}</p>;
}
