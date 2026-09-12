/** Sessions: every conversation this agent has had, newest first, in one dense table — and the table itself. */

import type { SessionLine } from "@pinecall/protocol";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { started } from "../../lib/clock";
import { useScoredCalls, type Scored } from "../../lib/use-scored-calls";
import "./sessions.css";

// The table is the whole screen on purpose: nine columns an operator scans down, no cards, no
// charts. A row is a link into the log that produced it. A call older than the door's screenful is
// still readable by id, and the box at the top opens one.
const BY_HAND = "call";

export function Sessions(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const { rows, error } = useScoredCalls(agent);
  const navigate = useNavigate();

  const open = (submitted: FormEvent<HTMLFormElement>): void => {
    submitted.preventDefault();
    const asked = new FormData(submitted.currentTarget).get(BY_HAND);
    if (typeof asked === "string" && asked.trim() !== "") {
      void navigate(`/a/${agent}/sessions/${asked.trim()}`);
    }
  };

  return (
    <div className="page page-wide">
      <div className="sessions-head">
        <header className="page-head">
          <div className="page-eyebrow">{agent}</div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-lede">
            Every conversation this agent has had, newest first — phone calls included. A row opens the
            session's append-only log: one line per fact, numbered by <code className="mono">seq</code>, with
            the per-turn STT / LLM / TTS breakdown and the consent proof beside it. The <strong>score</strong>{" "}
            column is the call judging itself, written into the same log as{" "}
            <code className="mono">call.score</code> within a minute of the caller hanging up.
          </p>
        </header>
        <form className="by-hand" onSubmit={open}>
          <input className="by-hand-id" name={BY_HAND} placeholder="open a call by id" aria-label="a call id" />
          <button className="by-hand-open" type="submit">
            open
          </button>
        </form>
      </div>

      {error !== null && <p className="note note-warn">{error}</p>}

      <SessionTable rows={rows} />
    </div>
  );
}

/**
 * The table itself, drawn by this screen and by the org's Sessions (screens/floor): the same
 * eight columns, plus the agent's when the rows span agents. A row is a link into the log that
 * produced it, under the agent that handled it — which the line itself names now.
 */
export function SessionTable({ rows, withAgent = false }: { rows: Scored[]; withAgent?: boolean }): ReactNode {
  if (rows.length === 0) {
    return (
      <section className="section">
        <div className="empty">
          <p className="empty-title">No session recorded yet</p>
          <div className="empty-body">
            <p>
              The log is append-only and written during the call, so a session appears here the moment one
              ends — from the browser, from <code className="mono">pinecall chat</code>, or from the telephone.
            </p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="section">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>session</th>
              {withAgent && <th>agent</th>}
              <th>channel</th>
              <th>from</th>
              <th>started</th>
              <th>duration</th>
              <th>outcome</th>
              <th>score</th>
              <th className="num">cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row key={row.line.call} row={row} withAgent={withAgent} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {rows.length} session{rows.length === 1 ? "" : "s"} · the same rows{" "}
        <code className="mono">pinecall-runtime sessions list</code> prints
      </p>
    </section>
  );
}

/** One call: identity, medium, envelope, and the two numbers that judge and price it. */
function Row({ row, withAgent }: { row: Scored; withAgent: boolean }): ReactNode {
  const { line } = row;
  return (
    <tr>
      <td className="id">
        <Link to={`/a/${line.agent}/sessions/${line.call}`} className="link">
          {line.call}
        </Link>
      </td>
      {withAgent && <td className="mono dim">{line.agent}</td>}
      <td>
        <span className="medium">{line.channel ?? "—"}</span>
      </td>
      <td className="mono dim">{whoWasOn(line)}</td>
      <td className="mono dim">{started(line.started_at)}</td>
      <td className="mono dim">{duration(line)}</td>
      <td>
        <span className={`outcome outcome-${line.end_reason ?? "none"}`}>{line.outcome ?? line.end_reason ?? "—"}</span>
      </td>
      <td>
        <ScoreChip row={row} />
      </td>
      <td className="num dim">{euros(line.cost?.eur)}</td>
    </tr>
  );
}

// The contact's name when the platform recognised the caller, and the number it came from when it
// did not: the same two facts the Calls list draws, because they are the only two there are.
function whoWasOn(line: SessionLine): string {
  return line.caller?.name ?? line.from ?? "—";
}

/** `1m 04s` — how long the call lasted, or a dash while it is still running. */
export function duration(line: { started_at: number | null; ended_at: number | null }): string {
  if (line.started_at === null || line.ended_at === null) return "—";
  const total = Math.max(0, Math.round(line.ended_at - line.started_at));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

/** Four decimals, because a whole call costs less than a cent and 0.00 € is a lie. */
export function euros(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(4)} €`;
}

// Three different facts share the dash, and the tooltip names them: a call nobody has read yet, a
// call whose log carries no verdict, and a call the judges could not judge.
function ScoreChip({ row }: { row: Scored }): ReactNode {
  if (!row.read) return <span className="faint mono">…</span>;
  const score = row.score;
  if (score === null) return <span className="faint mono" title="this call's log carries no verdict">—</span>;
  if (score.passed == null) {
    return <span className="faint mono" title={score.not_judged ?? "nobody judged this call"}>not judged</span>;
  }
  const held = score.judges.filter((judge) => judge.verdict === "held").length;
  return (
    <span className={score.passed ? "ev-held mono" : "ev-bad mono"} title={score.judges.map((judge) => `${judge.name} ${judge.verdict}`).join(", ")}>
      {score.passed ? "passed" : "did not pass"} · {held}/{score.judges.length}
    </span>
  );
}
