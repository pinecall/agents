/** The rows between the turns: a state change, a confirmation, a fact from outside, a quiet stretch. */

import type { Confirm, Entry, EventSource, StateCause } from "@pinecall/protocol";
import type { ReactNode } from "react";

import type { SupervisorMark } from "../../lib/supervisor-mark";

/** ◆ what the app's state did here, and what moved it: a tool's result or a fact from outside. */
export function StateRow({
  changed,
  cause,
  seq,
}: {
  changed: string[];
  cause: StateCause | null;
  seq: number;
}): ReactNode {
  return (
    <p className="live-mark live-mark-state">
      <span className="live-mark-glyph">◆</span>
      <span className="live-mark-said fixed">
        {changed.join(", ")} ← {causeOf(cause)}
      </span>
      <span className="live-mark-seq fixed">{seq}</span>
    </p>
  );
}

/** ⊙ a human at the desk: what they did to this call, and the token that says who they were. */
export function SupervisorRow({ mark, seq }: { mark: SupervisorMark; seq: number }): ReactNode {
  return (
    <p className="live-mark live-mark-supervisor">
      <span className="live-mark-glyph">⊙</span>
      <span className="live-mark-said" title={mark.said}>
        {mark.said}
      </span>
      <span className="live-mark-outcome fixed">{mark.by}</span>
      <span className="live-mark-seq fixed">{seq}</span>
    </p>
  );
}

/** ⏳ the yes the platform asked for: pending from here until the caller granted or declined it. */
export function ConfirmRow({ confirm, seq }: { confirm: Confirm; seq: number }): ReactNode {
  return (
    <details className={`live-mark live-mark-confirm live-mark-confirm-${confirm.status}`}>
      <summary className="live-mark-line">
        <span className="live-mark-glyph">⏳</span>
        <span className="live-mark-said">{confirm.phrase}</span>
        <span className="live-mark-outcome">{confirm.status}</span>
        <span className="live-mark-seq fixed">{seq}</span>
      </summary>
      <dl className="readings">
        <div className="reading">
          <dt className="reading-field fixed">tool</dt>
          <dd className="reading-value fixed">{confirm.tool}</dd>
        </div>
        <div className="reading">
          <dt className="reading-field fixed">audience</dt>
          <dd className="reading-value fixed">{confirm.audience}</dd>
        </div>
        {confirm.said === undefined ? null : (
          <div className="reading">
            <dt className="reading-field fixed">said</dt>
            <dd className="reading-value fixed">{confirm.said}</dd>
          </div>
        )}
        {confirm.reason === undefined ? null : (
          <div className="reading">
            <dt className="reading-field fixed">reason</dt>
            <dd className="reading-value fixed">{confirm.reason}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}

/** ⚡ a fact that reached the agent from outside the conversation, with where it came from. */
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
    <details className="live-mark live-mark-event">
      <summary className="live-mark-line">
        <span className="live-mark-glyph">⚡</span>
        <span className="live-mark-said fixed">{name}</span>
        <span className="live-mark-outcome">{source}</span>
        <span className="live-mark-seq fixed">{seq}</span>
      </summary>
      <pre className="live-mark-data fixed">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

// Nothing here is dropped: a metric block, a state of the session, a prompt rewritten and a
// participant coming and going are all in the log, and a reader who wants them opens the row.
/** ▸ the stretch of the log that is not conversation, folded into one line until somebody looks. */
export function QuietRow({ entries }: { entries: Entry[] }): ReactNode {
  return (
    <details className="live-mark live-mark-quiet">
      <summary className="live-mark-line">
        <span className="live-mark-glyph">▸</span>
        <span className="live-mark-said">{entries.length} entries</span>
        <span className="live-mark-seq fixed">{entries[0]?.seq}</span>
      </summary>
      <ul className="live-mark-quiet-list">
        {entries.map((entry) => (
          <li className="fixed" key={`${String(entry.seq)}-${entry.type}`}>
            {entry.seq} {entry.type}
          </li>
        ))}
      </ul>
    </details>
  );
}

function causeOf(cause: StateCause | null): string {
  if (cause === null) {
    return "the app";
  }
  return cause.kind === "tool" ? cause.tool : `${cause.name} (seq ${String(cause.seq)})`;
}
