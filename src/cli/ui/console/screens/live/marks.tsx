/** The rows between the turns: a state change, a confirmation, a fact from outside, a supervisor, a quiet stretch. */

import type { Confirm, Entry, EventSource, StateCause } from "@pinecall/protocol";
import type { ReactNode } from "react";

import type { SupervisorMark } from "../../lib/supervisor-mark";
import { LogRow } from "./log-row";
import { Readings } from "./readings";

/** What the app's state did here, and what moved it: a tool's result or a fact from outside. */
export function StateRow({ changed, cause, seq }: { changed: string[]; cause: StateCause | null; seq: number }): ReactNode {
  return <LogRow seq={seq} kind="state" tone="state" said={`${changed.join(", ")} ← ${causeOf(cause)}`} />;
}

/** A human at the desk: what they did to this call, and the token that says who they were. */
export function SupervisorRow({ mark, seq }: { mark: SupervisorMark; seq: number }): ReactNode {
  return <LogRow seq={seq} kind="supervisor" tone="supervisor" said={mark.said} note={[mark.by]} />;
}

/** The yes the platform asked for: pending from here until the caller granted or declined it. */
export function ConfirmRow({ confirm, seq }: { confirm: Confirm; seq: number }): ReactNode {
  const rows = [
    { field: "tool", value: confirm.tool, unit: null },
    { field: "audience", value: confirm.audience, unit: null },
    ...(confirm.said == null ? [] : [{ field: "said", value: confirm.said, unit: null }]),
    ...(confirm.reason == null ? [] : [{ field: "reason", value: confirm.reason, unit: null }]),
  ];
  return (
    <LogRow seq={seq} kind="confirm" tone="confirm" said={confirm.phrase} note={[confirm.status]}>
      <Readings rows={rows} />
    </LogRow>
  );
}

/** A fact that reached the agent from outside the conversation, with where it came from. */
export function EventRow({
  name,
  source,
  data,
  seq,
}: {
  name: string;
  source: EventSource;
  data: Record<string, unknown>;
  seq: number;
}): ReactNode {
  return (
    <LogRow seq={seq} kind="event" tone="event" said={name} note={[source]}>
      <pre className="lv-data">{JSON.stringify(data, null, 2)}</pre>
    </LogRow>
  );
}

// Nothing here is dropped: a metric block, a state of the session, a prompt rewritten and a
// participant coming and going are all in the log, and a reader who wants them opens the row.
/** The stretch of the log that is not conversation, folded into one line until somebody looks. */
export function QuietRow({ entries }: { entries: Entry[] }): ReactNode {
  return (
    <LogRow seq={entries[0]?.seq} kind="quiet" tone="quiet" said={entries.length === 1 ? "1 entry" : `${entries.length} entries`}>
      <ul className="lv-list">
        {entries.map((entry) => (
          <li key={`${String(entry.seq)}-${entry.type}`}>
            {entry.seq} {entry.type}
          </li>
        ))}
      </ul>
    </LogRow>
  );
}

function causeOf(cause: StateCause | null): string {
  if (cause === null) {
    return "the app";
  }
  return cause.kind === "tool" ? cause.tool : `${cause.name} (seq ${String(cause.seq)})`;
}
