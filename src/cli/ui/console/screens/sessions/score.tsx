/** The post-call score, judge by judge, with the evidence each cites and what the opinion cost. */

import type { CallScore, Judgment } from "@pinecall/protocol";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { euros } from "./finished-calls";

// The panel is ordered the way the scorer runs: every judge that answered, then the bill. A judge
// of the panel that answered nothing is drawn dim with a dash rather than green: a panel that
// pretended otherwise would be the console lying about coverage.
export function ScoreBreakdown({
  agent,
  call,
  score,
  turns,
}: {
  agent: string;
  call: string;
  score: CallScore | null;
  turns: number;
}): ReactNode {
  if (score === null) {
    return (
      <p className="note">
        This call has no score: it is still running, or its log was sealed before the judges existed. Ask for one
        with <code className="mono">pinecall eval {call}</code>.
      </p>
    );
  }
  const answered = new Set(score.judges.map((judge) => judge.name));
  const silent = (score.panel ?? []).filter((name) => !answered.has(name));
  return (
    <div className="panel">
      <div className="panel-body">
        <ul className="score-list">
          {score.judges.map((judge) => (
            <ScoreRow key={judge.name} agent={agent} call={call} judgment={judge} />
          ))}
          {silent.map((name) => (
            <li key={name} className="score-row score-row-na">
              <span className="score-row-mark">–</span>
              <span className="score-row-name mono">{name}</span>
              <span className="score-row-kind">on the panel</span>
              <span className="score-row-reason">was run over this call and answered nothing</span>
            </li>
          ))}
        </ul>
        {score.not_judged != null && <p className="note note-warn">{score.not_judged}</p>}
        <p className="note">{billOf(score, turns)}</p>
      </div>
    </div>
  );
}

function ScoreRow({ agent, call, judgment }: { agent: string; call: string; judgment: Judgment }): ReactNode {
  const held = judgment.verdict === "held";
  return (
    <li className={held ? "score-row score-row-pass" : "score-row score-row-fail"}>
      <span className="score-row-mark">{held ? "✓" : "✗"}</span>
      <span className="score-row-name mono">{judgment.name}</span>
      <span className="score-row-kind">{judgment.verdict}</span>
      <span className="score-row-reason">
        {judgment.reason}
        {judgment.evidence.said != null && <span className="score-row-said"> “{judgment.evidence.said}”</span>}
      </span>
      <span className="score-row-seqs">
        {judgment.evidence.seqs.map((seq) => (
          <Link key={seq} className="chip" to={`/a/${agent}/sessions/${call}#seq-${seq}`}>
            <span className="chip-key">seq</span>
            <span className="chip-val">{seq}</span>
          </Link>
        ))}
      </span>
    </li>
  );
}

/** One sentence about the only part of this that cost money. */
function billOf(score: CallScore, turns: number): string {
  const replayed = `${turns} turns replayed from the log`;
  if (score.judge_calls === 0) return `${replayed}; the hard policies alone, and they cost nothing.`;
  return `${replayed}; ${score.judge_calls} judge call${score.judge_calls === 1 ? "" : "s"} for ${euros(score.judge_cost_eur)}.`;
}
