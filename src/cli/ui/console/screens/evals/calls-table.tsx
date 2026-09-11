/** The agent's finished calls as the judges sealed them: one dense line each, and the evidence under the open one. */

import type { CallScore, Judgment } from "@pinecall/protocol";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError } from "../../lib/api";
import { started } from "../../lib/clock";
import { useCredentials } from "../../lib/credentials";
import type { Scored } from "../../lib/use-scored-calls";
import { promoteCall, replayCall, type Promoted, type Replayed } from "./door";

// `passed` is OPTIONAL on `call.score`, and its absence is a THIRD thing: nobody answered, which is
// neither a green call nor a red one (the runtime's docs/decisions/scoring.md). So the word is
// read off the field being there at all, and `not_judged` says why when it is not.
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
      <WhatToDoWithIt call={row.line.call} />
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
// dropped it rather than inventing a verdict for it (the runtime's docs/decisions/scoring.md).
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

/**
 * The two things a person does to a call they have just read. Ring 3 re-checks it by code — the
 * runtime rebuilds the call from its log and answers four verdicts, and nothing is re-run — and
 * promote writes it down as a golden CANDIDATE in this directory's `test/candidates`, carrying
 * `promoted_from`, for a person to edit before it counts as a golden. `pinecall eval <call>` and
 * `pinecall runs promote <call>`, over the same two doors.
 */
function WhatToDoWithIt({ call }: { call: string }): ReactNode {
  const credentials = useCredentials();
  const [busy, setBusy] = useState("");
  const [replayed, setReplayed] = useState<Replayed | null>(null);
  const [promoted, setPromoted] = useState<Promoted | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const does = async (what: "check" | "promote"): Promise<void> => {
    setBusy(what);
    setRefused(null);
    try {
      if (what === "check") setReplayed(await replayCall(credentials, call));
      else setPromoted(await promoteCall(credentials, call));
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="ev-acts">
        <button type="button" className="button" disabled={busy !== ""} onClick={() => void does("check")}>
          {busy === "check" ? "checking…" : "re-check by code"}
        </button>
        <button type="button" className="button" disabled={busy !== ""} onClick={() => void does("promote")}>
          {busy === "promote" ? "writing…" : "promote to a golden"}
        </button>
        {replayed !== null && (
          <span className={replayed.passed ? "accent mono" : "ev-bad mono"}>
            {replayed.verdicts.map((verdict) => `${verdict.check} ${verdict.status}`).join(" · ")}
          </span>
        )}
        {promoted !== null && (
          <span className="mono dim">
            {promoted.path} · {promoted.candidate.input.length} caller turn(s)
          </span>
        )}
      </div>
      {refused !== null && <p className="note note-warn">{refused}</p>}
      {promoted?.notes.map((note) => (
        <p key={note} className="note">
          {note}
        </p>
      ))}
    </>
  );
}
