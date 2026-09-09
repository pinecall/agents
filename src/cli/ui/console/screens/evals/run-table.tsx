/** Every run as one dense line; the judgments collapse into a tally so a regression is visible. */

import type { ReactNode } from "react";

import { started } from "../../lib/clock";
import { deltaBetween, tallyOf, type Delta } from "./deltas";
import type { EvalRun } from "./door";

export function RunTable({
  runs,
  selected,
  onSelect,
}: {
  runs: EvalRun[];
  selected: string | null;
  onSelect: (id: string) => void;
}): ReactNode {
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>run</th>
              <th>started</th>
              <th>status</th>
              <th className="num">goldens</th>
              <th className="num">models</th>
              <th className="num">held</th>
              <th className="num">judge calls</th>
              <th>since the run before</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, at) => (
              <Row key={run.id} run={run} before={runs[at + 1]} open={run.id === selected} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        {runs.length} run{runs.length === 1 ? "" : "s"} · the same rows <code className="mono">pinecall runs list</code> prints
      </p>
    </>
  );
}

function Row({
  run,
  before,
  open,
  onSelect,
}: {
  run: EvalRun;
  before: EvalRun | undefined;
  open: boolean;
  onSelect: (id: string) => void;
}): ReactNode {
  const tally = tallyOf(run.matrix);
  return (
    <tr className={open ? "ev-row is-open" : "ev-row"} onClick={() => onSelect(run.id)}>
      <td className="id">
        <button type="button" className="link">
          {run.id}
        </button>
      </td>
      <td className="mono dim">{started(run.started_at)}</td>
      <td>
        <span className={`ev-status-${run.status}`}>{run.status}</span>
      </td>
      <td className="num dim">{run.matrix?.goldens.length ?? "—"}</td>
      <td className="num dim">{run.matrix?.models.length ?? "—"}</td>
      <td className={tally.judgments > 0 && tally.held < tally.judgments ? "num ev-bad" : "num"}>
        {tally.judgments === 0 ? "—" : `${tally.held}/${tally.judgments}`}
      </td>
      <td className="num faint">{run.matrix?.judge_calls ?? "—"}</td>
      <td>
        <Changed delta={deltaBetween(run, before)} />
      </td>
    </tr>
  );
}

// The delta names the judgments that changed hands. It is not a number about a run: an average
// over goldens would say a run got worse without saying what a person should go and read.
export function Changed({ delta }: { delta: Delta | null }): ReactNode {
  if (delta === null) {
    return <span className="faint mono">first of its kind</span>;
  }
  if (delta.broke.length === 0 && delta.recovered.length === 0) {
    return <span className="dim mono">±0</span>;
  }
  return (
    <span className="chips">
      {delta.broke.map((name) => (
        <span className="chip" key={`broke-${name}`}>
          <span className="chip-key ev-delta-down">broke</span>
          <span className="chip-val">{name}</span>
        </span>
      ))}
      {delta.recovered.map((name) => (
        <span className="chip" key={`held-${name}`}>
          <span className="chip-key ev-delta-up">held again</span>
          <span className="chip-val">{name}</span>
        </span>
      ))}
    </span>
  );
}
