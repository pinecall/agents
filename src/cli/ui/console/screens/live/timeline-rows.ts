/** The log read in seq order as the rows a person sees: turns, tools, state, confirmations, facts. */

import {
  eventOf,
  type Confirm,
  type DocsSources,
  type Entry,
  type EventSource,
  type MemoryOps,
  type State,
  type StateCause,
  type ToolRun,
  type Turn,
} from "@pinecall/protocol";

import { supervisorMark, type SupervisorMark } from "../../lib/supervisor-mark";

/** One row of the transcript. Every one carries the seq it happened at, and nothing invented. */
export type Row =
  | { kind: "turn"; seq: number; turn: Turn }
  | { kind: "tool"; seq: number; run: ToolRun }
  | { kind: "state"; seq: number; changed: string[]; cause: StateCause | null }
  | { kind: "confirm"; seq: number; confirm: Confirm }
  | { kind: "event"; seq: number; name: string; source: EventSource; data: Record<string, unknown> }
  | { kind: "supervisor"; seq: number; mark: SupervisorMark }
  | { kind: "memory"; seq: number; ops: MemoryOps }
  | { kind: "sources"; seq: number; sources: DocsSources }
  | { kind: "quiet"; seq: number; entries: Entry[] };

// Every row that is not a turn shows the object the reducer already built — the ToolRun with its
// result, the Confirm with its verdict — found by the id the entry carries. The entry says WHERE
// it happened; the state says what it became.
/** The rows of these entries, in the order the log wrote them. */
export function rowsOf(entries: Entry[], state: State): Row[] {
  const rows: Row[] = [];
  let quiet: Entry[] = [];

  const flush = (): void => {
    if (quiet.length > 0) {
      rows.push({ kind: "quiet", seq: quiet[0]?.seq ?? 0, entries: quiet });
      quiet = [];
    }
  };

  for (const entry of entries) {
    const row = rowOf(entry, state);
    if (row === null) {
      quiet.push(entry);
      continue;
    }
    flush();
    rows.push(row);
  }
  flush();
  return rows;
}

// ── one entry, read ─────────────────────────────────────────────────────────────

// null means the row is not one a reader follows a conversation by: a metric block, a state of the
// session, a prompt rewritten. They are kept, collapsed, and expanded by whoever wants them.
function rowOf(entry: Entry, state: State): Row | null {
  const seq = entry.seq;
  // A human stepping into the call is a sentence, never a folded row: the six supervisor entries
  // read the same here and on the Talk screen (lib/supervisor-mark.ts).
  const supervised = supervisorMark(entry);
  if (supervised !== null) {
    return { kind: "supervisor", seq, mark: supervised };
  }
  const event = eventOf(entry);
  switch (event.type) {
    case "turn.user":
    case "turn.agent": {
      const turn = turnOf(state, event.type === "turn.user" ? "user" : "agent", event.data.speech_id);
      return turn === undefined ? null : { kind: "turn", seq, turn };
    }
    case "tool.call": {
      const run = last(state.tools, (one) => one.call_id === event.data.call_id);
      return run === undefined ? null : { kind: "tool", seq, run };
    }
    case "state.changed":
      return { kind: "state", seq, changed: event.data.changed, cause: event.data.cause ?? null };
    case "confirm.request": {
      const confirm = last(state.confirms, (one) => one.call_id === event.data.call_id);
      return confirm === undefined ? null : { kind: "confirm", seq, confirm };
    }
    case "event.received":
      return {
        kind: "event",
        seq,
        name: event.data.name,
        source: event.data.source,
        data: event.data.data,
      };
    // What a lookup put in front of the model before it answered: read by the turn it sits under.
    case "memory.ops":
      return { kind: "memory", seq, ops: event.data };
    case "docs.sources":
      return { kind: "sources", seq, sources: event.data };
    // The interim words are the live row at the foot of the timeline, not a row of their own, and
    // the final ones already arrived as a turn.
    default:
      return null;
  }
}

function turnOf(state: State, role: Turn["role"], speechId: string): Turn | undefined {
  return last(state.turns, (turn) => turn.role === role && turn.speech_id === speechId);
}

function last<T>(items: T[], matches: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as T;
    if (matches(item)) {
      return item;
    }
  }
  return undefined;
}
