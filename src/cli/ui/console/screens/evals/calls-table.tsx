/** The agent's finished calls as the judges sealed them: one dense line each, and the evidence under the open one. */

import type { CallScore, Judgment } from "@pinecall/protocol";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { started } from "../../lib/clock";
import type { Scored } from "../../lib/use-scored-calls";

// `passed` is OPTIONAL on `call.score`, and its absence is a THIRD thing: nobody answered, which is
// neither a green call nor a red one (docs/decisions/scoring.md). So the word is read off the field
// being there at all, and `not_judged` says why when it is not.
export function CallsTable({ agent, rows }: { agent: string; rows: Scored[] }): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  const opened = rows.find((row) => row.line.call === open) ?? null;
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>call</th>
              <th>started</th>
              <th>verdict</th>
              <th>judges</th>
              <th className="num">judge calls</th>
              <th className="num">cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.line.call} className={row.line.call === open ? "ev-row is-open" : "ev-row"} onClick={() => setOpen(row.line.call)}>
                <td className="id">
                  <button type="button" className="link">
                    {row.line.call}
                  </button>
                </td>
                <td className="mono dim">{started(row.line.started_at)}</td>
                <td>
                  <Word row={row} />
                </td>
                <td>
                  <span className="chips">
                    {row.score?.judges.map((judge) => (
                      <span key={judge.name} className="chip">
                        <span className="chip-key">{judge.name}</span>
                        <span className={judge.verdict === "held" ? "chip-val accent" : "chip-val ev-bad"}>{judge.verdict}</span>
                      </span>
                    ))}
                  </span>
                </td>
                <td className="num faint">{row.score?.judge_calls ?? "—"}</td>
                <td className="num dim">{row.score?.judge_cost_eur == null ? "—" : `${row.score.judge_cost_eur.toFixed(4)} €`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {rows.length} call{rows.length === 1 ? "" : "s"} · the verdict is the <code className="mono">call.score</code> entry the log
        seals on
      </p>
      {opened !== null && <Evidence agent={agent} row={opened} />}
    </>
  );
}

function Word({ row }: { row: Scored }): ReactNode {
  if (!row.read) return <span className="faint mono">reading…</span>;
  if (row.refused !== null) return <span className="ev-bad mono">{row.refused}</span>;
  if (row.score?.passed == null) return <span className="faint mono">nobody judged this call</span>;
  return <span className={row.score.passed ? "accent mono" : "ev-bad mono"}>{row.score.passed ? "passed" : "did not pass"}</span>;
}

// The evidence: every judge that did not hold, its own sentence, and the seqs it cites as the way
// into the log at the lines it is about. A reader who disagrees with a verdict opens the call at
// exactly those entries.
function Evidence({ agent, row }: { agent: string; row: Scored }): ReactNode {
  const score = row.score;
  return (
    <div className="ev-detail">
      <h3 className="section-title">
        <Link className="link" to={`/a/${agent}/sessions/${row.line.call}`}>
          {row.line.call}
        </Link>
      </h3>
      {score === null && <p className="note">this call's log carries no verdict</p>}
      {score?.not_judged != null && <p className="note note-warn">{score.not_judged}</p>}
      {score !== null && <Silent score={score} />}
      {score?.judges
        .filter((judge) => judge.verdict !== "held")
        .map((judge) => <Said key={judge.name} agent={agent} call={row.line.call} judgment={judge} />)}
      {score !== null && score.judges.every((judge) => judge.verdict === "held") && (
        <p className="note">every judge on the panel held: {score.judges.map((judge) => judge.name).join(", ")}</p>
      )}
    </div>
  );
}

// A judge of the panel with no row of its own answered nothing — it raised, and livekit's group
// dropped it rather than inventing a verdict for it (docs/decisions/scoring.md).
function Silent({ score }: { score: CallScore }): ReactNode {
  const answered = new Set(score.judges.map((judge) => judge.name));
  const silent = (score.panel ?? []).filter((name) => !answered.has(name));
  if (silent.length === 0) return null;
  return (
    <p className="note note-warn">
      {silent.join(", ")} was run over this call and answered nothing; the panel was {score.panel?.join(", ")}
    </p>
  );
}

function Said({ agent, call, judgment }: { agent: string; call: string; judgment: Judgment }): ReactNode {
  const seqs = judgment.evidence.seqs;
  return (
    <div className="panel ev-said">
      <div className="panel-head">
        <span className="panel-title ev-bad">
          {judgment.name} · {judgment.verdict}
        </span>
        <span className="badge">{judgment.criteria}</span>
      </div>
      <div className="panel-body">
        <p className="ev-reason">{judgment.reason}</p>
        {judgment.evidence.said != null && <p className="ev-quote">“{judgment.evidence.said}”</p>}
        {seqs.length > 0 && (
          <span className="chips">
            {seqs.map((seq) => (
              <Link key={seq} className="chip" to={`/a/${agent}/sessions/${call}#seq-${seq}`}>
                <span className="chip-key">seq</span>
                <span className="chip-val">{seq}</span>
              </Link>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
