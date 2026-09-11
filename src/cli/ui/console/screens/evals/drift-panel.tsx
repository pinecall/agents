/** Drift: each judge's held-rate over two windows of finished calls, and the points between them. */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { Nothing } from "../../shell/nothing";
import { readDrift, type Drifted, type JudgeDrift } from "./door";

const A_DAY = 24 * 60 * 60;

/** The two windows `pinecall runs drift` has when nobody names one: a week against a month. */
const WINDOW_DAYS = 7;
const BASELINE_DAYS = 30;

/**
 * The panel. Nothing here is judged again: a held-rate is a count of the verdicts `call.score`
 * already carries, and a delta is two counts subtracted. A judge that settled nothing in one of
 * the two windows has NO delta — silence is not a drop — and says so rather than reading zero.
 */
export function DriftPanel({ agent }: { agent: string }): ReactNode {
  const credentials = useCredentials();
  const [window, setWindow] = useState(WINDOW_DAYS);
  const [baseline, setBaseline] = useState(BASELINE_DAYS);
  const [read, setRead] = useState<Drifted | null>(null);
  const [reading, setReading] = useState(true);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    setReading(true);
    readDrift(credentials, agent, window * A_DAY, baseline * A_DAY).then(
      (drifted) => {
        if (gone) return;
        setRead(drifted);
        setReading(false);
      },
      (failed: unknown) => {
        if (gone) return;
        setRefused(failed instanceof GatewayError ? failed.message : String(failed));
        setReading(false);
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent, window, baseline]);

  return (
    <section className="section">
      <h2 className="section-title">Drift</h2>
      <div className="drift-windows">
        <label className="drift-field">
          <span className="dim">now, days</span>
          <input
            className="input suite-input mono"
            type="number"
            min={1}
            max={365}
            value={window}
            onChange={(event) => setWindow(Number(event.target.value))}
          />
        </label>
        <label className="drift-field">
          <span className="dim">against the last</span>
          <input
            className="input suite-input mono"
            type="number"
            min={1}
            max={365}
            value={baseline}
            onChange={(event) => setBaseline(Number(event.target.value))}
          />
        </label>
        {reading && <span className="faint mono">reading…</span>}
      </div>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {read !== null && read.drift.judges.length === 0 && (
        <Nothing>No finished call of this agent carries a verdict in either window.</Nothing>
      )}

      {read !== null && read.drift.judges.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>judge</th>
                  <th className="num">before</th>
                  <th className="num">now</th>
                  <th className="num">points</th>
                </tr>
              </thead>
              <tbody>
                {read.drift.judges.map((judge) => (
                  <tr key={judge.judge}>
                    <td className="id">{judge.judge}</td>
                    <td className="num dim">{rate(judge, "before")}</td>
                    <td className="num">{rate(judge, "now")}</td>
                    <td className={`num ${points(judge, read.threshold)}`}>
                      {judge.delta === null ? "—" : `${judge.delta > 0 ? "+" : ""}${judge.delta.toFixed(0)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            {read.drift.notJudged.now} call{read.drift.notJudged.now === 1 ? "" : "s"} in this window carried no
            verdict at all ({read.drift.notJudged.before} before it). A judge may fall{" "}
            {read.threshold.toFixed(0)} points before `pinecall runs drift` fails the night.
          </p>
          {read.drift.broke.length > 0 && (
            <ul className="drift-broke">
              {read.drift.broke.map((broke) => (
                <li key={`${broke.call}-${broke.judge}`}>
                  <Link className="link mono" to={`/a/${agent}/sessions/${broke.call}`}>
                    {broke.call}
                  </Link>
                  <span className="ev-bad mono">{broke.judge}</span>
                  <span className="dim">{broke.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** One window as a cell: how many verdicts held out of how many settled, and the percent. */
function rate(judge: JudgeDrift, which: "before" | "now"): string {
  const standing = judge[which];
  return standing === null ? "—" : `${standing.percent.toFixed(0)}% (${standing.held}/${standing.settled})`;
}

// A drop past the threshold is the one number on this screen that means somebody has to do
// something tonight, so it is the one that is coloured.
function points(judge: JudgeDrift, threshold: number): string {
  if (judge.delta === null) return "faint";
  return judge.delta < -Math.abs(threshold) ? "ev-bad" : "dim";
}
