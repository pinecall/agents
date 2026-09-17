/** The agent's finished calls as the judges sealed them: one line each, and the evidence under the open one. */

import type { CallScore, Judgment } from "@pinecall/protocol";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";

import { dayAndTime, euros } from "../../lib/format";
import type { Scored } from "../../lib/use-scored-calls";
import { Pill, SectionLabel, TableHead } from "../../ui";
import { WhatToDoWithIt } from "./what-to-do";

const COLUMNS = "minmax(0,1.2fr) 120px 104px minmax(0,1.7fr) 70px 84px";

// `passed` is OPTIONAL on `call.score`, and its absence is a THIRD thing: nobody answered, which is
// neither a green call nor a red one (the runtime's docs/decisions/scoring.md). So the word is
// read off the field being there at all, and `not_judged` says why when it is not.
export function CallsTable({ agent, rows }: { agent: string; rows: Scored[] }): ReactNode {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <TableHead columns={COLUMNS} labels={["Call", "Started", "Verdict", "Judges", "Calls>", "Cost>"]} />
      {rows.map((row) => (
        <div key={row.line.call}>
          <div
            className={row.line.call === open ? "ui-table-row ui-table-row-link ev-row-open" : "ui-table-row ui-table-row-link"}
            style={{ gridTemplateColumns: COLUMNS }}
            onClick={() => setOpen(row.line.call === open ? null : row.line.call)}
          >
            <span className="ui-cell-link ui-clip">{row.line.call}</span>
            <span className="ui-cell-faint">{dayAndTime(row.line.started_at)}</span>
            <span>
              <Word row={row} />
            </span>
            <span className="ui-tags">
              {row.score?.judges.map((judge) => (
                <span key={judge.name} className={judge.verdict === "held" ? "ev-judge" : "ev-judge ev-judge-bad"}>
                  {judge.name}
                </span>
              ))}
            </span>
            <span className="ev-num ev-num-faint">{row.score?.judge_calls ?? "—"}</span>
            <span className="ev-num ev-num-faint">{euros(row.score?.judge_cost_eur)}</span>
          </div>
          {row.line.call === open && <Evidence agent={agent} row={row} />}
        </div>
      ))}
    </>
  );
}

function Word({ row }: { row: Scored }): ReactNode {
  if (!row.read) return <Pill tone="muted">reading…</Pill>;
  if (row.refused !== null) return <span title={row.refused}><Pill tone="red">unreadable</Pill></span>;
  if (row.score?.passed == null) return <Pill tone="muted">not judged</Pill>;
  return row.score.passed ? <Pill tone="green">passed</Pill> : <Pill tone="red">did not pass</Pill>;
}

// The evidence: every judge that did not hold, its own sentence, and the seqs it cites as the way
// into the log at the lines it is about. A reader who disagrees with a verdict opens the call at
// exactly those entries.
function Evidence({ agent, row }: { agent: string; row: Scored }): ReactNode {
  const score = row.score;
  return (
    <div className="ev-evidence">
      <div className="ev-evidence-head">
        <Link className="ui-cell-link" to={`/a/${agent}/sessions/${row.line.call}`}>
          Open the session
        </Link>
      </div>
      <WhatToDoWithIt call={row.line.call} />
      {score === null && <div className="ui-note">This call's log carries no verdict.</div>}
      {score?.not_judged != null && <div className="ev-warn">{score.not_judged}</div>}
      {score !== null && <Silent score={score} />}
      {score?.judges
        .filter((judge) => judge.verdict !== "held")
        .map((judge) => <Said key={judge.name} agent={agent} call={row.line.call} judgment={judge} />)}
      {score !== null && score.judges.length > 0 && score.judges.every((judge) => judge.verdict === "held") && (
        <div className="ui-note">Every judge on the panel held: {score.judges.map((judge) => judge.name).join(", ")}.</div>
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
    <div className="ev-warn">
      {silent.join(", ")} was run over this call and answered nothing; the panel was {score.panel?.join(", ")}.
    </div>
  );
}

function Said({ agent, call, judgment }: { agent: string; call: string; judgment: Judgment }): ReactNode {
  const seqs = judgment.evidence.seqs;
  return (
    <div className="ev-said">
      <SectionLabel>
        {judgment.name} · {judgment.verdict}
      </SectionLabel>
      <div className="ev-said-body">
        <div className="ev-reason">{judgment.reason}</div>
        <div className="ui-cell-faint">{judgment.criteria}</div>
        {judgment.evidence.said != null && <div className="ev-quote">“{judgment.evidence.said}”</div>}
        {seqs.length > 0 && (
          <div className="ui-tags">
            {seqs.map((seq) => (
              <Link key={seq} className="ui-tag" to={`/a/${agent}/sessions/${call}#seq-${seq}`}>
                seq {seq}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
