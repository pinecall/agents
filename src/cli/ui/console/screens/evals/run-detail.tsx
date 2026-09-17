/** One run in full: what it was, and every judgment it put, golden by golden, next to the run before. */

import type { ReactNode } from "react";
import { Link } from "react-router";

import { dayAndTime } from "../../lib/format";
import { Bar, Card, CardHead, Empty, KV, Pill, TableHead } from "../../ui";
import { deltaBetween } from "./deltas";
import type { Cell, EvalRun, Judged } from "./door";
import { Reproductions } from "./reproductions";
import { Changed } from "./run-table";

const COLUMNS = "minmax(0,1.1fr) minmax(0,.8fr) 110px 120px 84px minmax(0,1.6fr)";

const STATUS_TONE = { done: "green", running: "amber", failed: "red" } as const;

export function RunDetail({ run, before }: { run: EvalRun; before: EvalRun | undefined }): ReactNode {
  return (
    <Card>
      <CardHead title={run.id} meta={`${run.agent} · ${run.matrix?.judge_calls ?? 0} judge calls`}>
        <span className="ev-head-end">
          <Pill tone={STATUS_TONE[run.status]}>{run.status}</Pill>
        </span>
      </CardHead>
      <div className="ev-facts">
        <KV label="Started">{dayAndTime(run.started_at)}</KV>
        <KV label="Finished">{dayAndTime(run.finished_at)}</KV>
        {run.error !== null && <KV label="Error">{run.error}</KV>}
        <KV label="Since before">
          <Changed delta={deltaBetween(run, before)} />
        </KV>
      </div>

      {run.matrix === null ? (
        <Empty>No matrix yet — the run is still opening its calls, or it failed before a judge answered.</Empty>
      ) : (
        <>
          <TableHead columns={COLUMNS} labels={["Golden", "Model", "Metric", "Score", "Held", "The judge's own sentence"]} />
          {run.matrix.runs.flatMap((cell) =>
            cell.scores.map((score) => <ScoreRow key={`${cell.golden}/${cell.model}/${score.metric}`} run={run} cell={cell} score={score} />),
          )}
          <div className="ui-card-foot">A hard policy writes the seqs into its reason on purpose, so the sentence is the way into the log.</div>
        </>
      )}

      <Reproductions run={run.id} />
    </Card>
  );
}

// A score on its own is unreadable — 0.8 is good or bad only against what the judge was asked. So
// the criteria and the judge's own sentence sit in the row, and a judgment that did not hold is
// the one thing on the sheet drawn in the danger colour.
function ScoreRow({ run, cell, score }: { run: EvalRun; cell: Cell; score: Judged }): ReactNode {
  const opened = run.calls.find((call) => call.golden === cell.golden && call.model === cell.model);
  return (
    <div className="ui-table-row" style={{ gridTemplateColumns: COLUMNS }}>
      <span className="ev-golden">
        <span className="ev-golden-says ui-clip">{cell.golden}</span>
        {opened !== undefined && (
          <Link className="ev-golden-call ui-clip" to={`/a/${run.agent}/sessions/${opened.call}`}>
            {opened.call}
          </Link>
        )}
      </span>
      <span className="ui-cell-faint ui-clip">{cell.model}</span>
      <span className="ui-cell-ink ui-clip">{score.metric}</span>
      <span className="ev-score">
        <span className="ev-score-value">{score.score.toFixed(2)}</span>
        <Bar share={score.score} color={score.passed ? "var(--green-dot)" : "var(--red)"} height={5} />
      </span>
      <span>{score.passed ? <Pill tone="green">held</Pill> : <Pill tone="red">did not hold</Pill>}</span>
      <span className="ev-reason" title={score.criteria}>
        {score.reason}
      </span>
    </div>
  );
}
