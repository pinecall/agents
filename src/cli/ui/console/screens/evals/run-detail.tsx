/** One run in full: what it was, and every judgment it put, golden by golden, next to the run before. */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { started } from "../../lib/clock";
import { deltaBetween } from "./deltas";
import type { Cell, EvalRun, Judged } from "./door";
import { Changed } from "./run-table";

export function RunDetail({ run, before }: { run: EvalRun; before: EvalRun | undefined }): ReactNode {
  return (
    <div className="ev-detail">
      <table className="kv">
        <tbody>
          <tr>
            <td className="kv-key">run</td>
            <td className="kv-val mono">{run.id}</td>
          </tr>
          <tr>
            <td className="kv-key">started</td>
            <td className="kv-val mono">{started(run.started_at)}</td>
          </tr>
          <tr>
            <td className="kv-key">finished</td>
            <td className="kv-val mono">{started(run.finished_at)}</td>
          </tr>
          <tr>
            <td className="kv-key">status</td>
            <td className="kv-val">
              <span className={`ev-status-${run.status}`}>{run.status}</span>
              {run.error !== null && <span className="dim"> · {run.error}</span>}
            </td>
          </tr>
          <tr>
            <td className="kv-key">since the run before</td>
            <td className="kv-val">
              <Changed delta={deltaBetween(run, before)} />
            </td>
          </tr>
        </tbody>
      </table>

      {run.matrix === null ? (
        <p className="note">no matrix yet — the run is still opening its calls, or it failed before a judge answered</p>
      ) : (
        <Scores run={run} cells={run.matrix.runs} />
      )}
    </div>
  );
}

// A score on its own is unreadable — 0.8 is good or bad only against what the judge was asked. So
// the criteria and the judge's own sentence sit in the row, and a judgment that did not hold is
// the one thing on the sheet drawn in the danger colour.
function Scores({ run, cells }: { run: EvalRun; cells: Cell[] }): ReactNode {
  return (
    <>
      <div className="table-wrap">
        <table className="table ev-scores">
          <thead>
            <tr>
              <th>golden</th>
              <th>model</th>
              <th>metric</th>
              <th className="num">score</th>
              <th>held</th>
              <th>the judge's own sentence</th>
              <th>call</th>
            </tr>
          </thead>
          <tbody>
            {cells.flatMap((cell) =>
              cell.scores.map((score) => <ScoreRow key={`${cell.golden}/${cell.model}/${score.metric}`} run={run} cell={cell} score={score} />),
            )}
          </tbody>
        </table>
      </div>
      <p className="note">
        {run.matrix?.judge_calls ?? 0} judge calls · a hard policy writes the seqs into its reason on purpose, so the
        sentence is the way into the log
      </p>
    </>
  );
}

function ScoreRow({ run, cell, score }: { run: EvalRun; cell: Cell; score: Judged }): ReactNode {
  const opened = run.calls.find((call) => call.golden === cell.golden && call.model === cell.model);
  return (
    <tr>
      <td className="mono">{cell.golden}</td>
      <td className="mono dim">{cell.model}</td>
      <td className="mono">{score.metric}</td>
      <td className="num">
        <span className="ev-score">
          <span className="ev-score-value">{score.score.toFixed(2)}</span>
          <span className="ev-track">
            <span className={score.passed ? "ev-bar" : "ev-bar ev-bar-bad"} style={{ width: `${Math.max(0, Math.min(1, score.score)) * 100}%` }} />
          </span>
        </span>
      </td>
      <td className={score.passed ? "mono accent" : "mono ev-bad"}>{score.passed ? "held" : "did not hold"}</td>
      <td className="ev-reason" title={score.criteria}>
        {score.reason}
      </td>
      <td className="id">
        {opened !== undefined && (
          <Link className="link" to={`/a/${run.agent}/sessions/${opened.call}`}>
            {opened.call}
          </Link>
        )}
      </td>
    </tr>
  );
}
