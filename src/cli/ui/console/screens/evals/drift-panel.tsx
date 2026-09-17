/** Drift: each judge's held-rate over two windows of finished calls, and the points between them. */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Card, CardHead, Empty, Input, Refused, TableHead } from "../../ui";
import { readDrift, type Drifted, type JudgeDrift } from "./door";

const A_DAY = 24 * 60 * 60;

/** The two windows `pinecall runs drift` has when nobody names one: a week against a month. */
const WINDOW_DAYS = 7;
const BASELINE_DAYS = 30;

const COLUMNS = "minmax(0,1fr) 150px 150px 90px";

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
    <Card>
      <CardHead title="Drift" meta={reading ? "reading…" : "held-rate per judge, over two windows"}>
        <span className="ev-drift-windows">
          <label className="ev-drift-field">
            <span>now, days</span>
            <Input size="sm" type="number" min={1} max={365} value={window} onChange={(event) => setWindow(Number(event.target.value))} />
          </label>
          <label className="ev-drift-field">
            <span>against the last</span>
            <Input size="sm" type="number" min={1} max={365} value={baseline} onChange={(event) => setBaseline(Number(event.target.value))} />
          </label>
        </span>
      </CardHead>

      <Refused>{refused}</Refused>

      {read !== null && read.drift.judges.length === 0 && <Empty>No finished call of this agent carries a verdict in either window.</Empty>}

      {read !== null && read.drift.judges.length > 0 && (
        <>
          <TableHead columns={COLUMNS} labels={["Judge", "Before>", "Now>", "Points>"]} />
          {read.drift.judges.map((judge) => (
            <div key={judge.judge} className="ui-table-row" style={{ gridTemplateColumns: COLUMNS }}>
              <span className="ui-cell-strong">{judge.judge}</span>
              <span className="ev-num ev-num-faint">{rate(judge, "before")}</span>
              <span className="ev-num">{rate(judge, "now")}</span>
              <span className={falling(judge, read.threshold) ? "ev-num ev-num-bad" : "ev-num ev-num-faint"}>
                {judge.delta === null ? "—" : `${judge.delta > 0 ? "+" : ""}${judge.delta.toFixed(0)}`}
              </span>
            </div>
          ))}
          <div className="ui-card-foot">
            {read.drift.notJudged.now} call{read.drift.notJudged.now === 1 ? "" : "s"} in this window carried no verdict at all ({read.drift.notJudged.before} before
            it). A judge may fall {read.threshold.toFixed(0)} points before `pinecall runs drift` fails the night.
          </div>
          {read.drift.broke.map((broke) => (
            <div key={`${broke.call}-${broke.judge}`} className="ev-broke">
              <Link className="ui-cell-link ui-clip" to={`/a/${agent}/sessions/${broke.call}`}>
                {broke.call}
              </Link>
              <span className="ev-judge ev-judge-bad">{broke.judge}</span>
              <span className="ev-reason">{broke.reason}</span>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

/** One window as a cell: the percent, and how many verdicts held out of how many settled. */
function rate(judge: JudgeDrift, which: "before" | "now"): string {
  const standing = judge[which];
  return standing === null ? "—" : `${standing.percent.toFixed(0)}% · ${standing.held}/${standing.settled}`;
}

// A drop past the threshold is the one number on this screen that means somebody has to do
// something tonight, so it is the one that is coloured.
function falling(judge: JudgeDrift, threshold: number): boolean {
  return judge.delta !== null && judge.delta < -Math.abs(threshold);
}
