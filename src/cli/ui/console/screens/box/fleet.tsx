/** Fleet: every worker the hub has heard from, what it is carrying, and the cordon over it. */

import { useCallback, useEffect, type ReactNode } from "react";

import { useCredentials } from "../../../shared/credentials";
import { Bar, Card, CardHead, Empty, Page, PageHead, Pill, Refused, Stat, Stats, TableHead, TableRow, TextAction, type Tone } from "../../ui";
import { cordon, readFleet, type Worker } from "./door-floor";
import { useDoor, useMove } from "./use-door";
import "./box.css";

// A heartbeat is not an event anybody can subscribe to: the hub hears one every few seconds and
// this page asks, on a clock of its own, for what it heard.
const EVERY_MS = 5_000;
const COLUMNS = "minmax(0,1.4fr) 150px 130px 120px 90px";

/**
 * The screen. A cordon is the one thing this page does to a worker, and it takes nothing away:
 * the worker finishes the calls it holds and is handed no new one. It is the move before a deploy.
 */
export function BoxFleet(): ReactNode {
  const credentials = useCredentials();
  const fleet = useDoor(useCallback(() => readFleet(credentials), [credentials]));
  const acting = useMove();
  const { reread } = fleet;

  useEffect(() => {
    const ticking = window.setInterval(() => void reread(), EVERY_MS);
    return () => window.clearInterval(ticking);
  }, [reread]);

  const seen = fleet.value;
  const quiet = (worker: Worker): boolean => seen !== undefined && seen.now - worker.seen_at > seen.stale_after_s;
  const taking = (seen?.workers ?? []).filter((worker) => !quiet(worker) && !worker.cordoned && !worker.draining);
  const calls = (seen?.workers ?? []).reduce((sum, worker) => sum + worker.active, 0);
  const seats = (seen?.workers ?? []).reduce((sum, worker) => sum + (quiet(worker) ? 0 : (worker.max_jobs ?? 0)), 0);

  return (
    <Page width={1060} tight>
      <PageHead title="Fleet" lede="Every worker the hub has heard from. A cordoned worker finishes its calls and is handed no new one — the move before a deploy, and it ends nothing." />

      <Refused>{fleet.refused ?? acting.refused}</Refused>

      {seen !== undefined && (
        <>
          <Stats min={170}>
            <Stat size="small" label="Workers taking calls" value={taking.length} of={`of ${seen.workers.length}`} />
            <Stat size="small" label="Calls right now" value={calls} of={seats > 0 ? `of ${seats} seats` : undefined} />
            <Stat size="small" label="Cordoned" value={seen.workers.filter((worker) => worker.cordoned).length} />
          </Stats>

          <Card>
            <CardHead title="Workers" meta={`re-read every ${EVERY_MS / 1000} s`} />
            {seen.workers.length === 0 ? (
              <Empty>No worker has reported. A hub with none answers every call on itself.</Empty>
            ) : (
              <>
                <TableHead columns={COLUMNS} labels={["Worker", "Calls", "Load", "Standing", ""]} />
                {seen.workers.map((worker) => {
                  const [word, tone] = standing(worker, quiet(worker));
                  return (
                    <TableRow key={worker.worker} columns={COLUMNS}>
                      <span className={quiet(worker) ? "ui-cell-faint box-fixed ui-clip" : "ui-cell-strong box-fixed ui-clip"}>{worker.worker}</span>
                      <span className="ui-cell-ink">
                        {worker.active}
                        {worker.max_jobs === null || worker.max_jobs === undefined ? "" : ` / ${worker.max_jobs}`}
                      </span>
                      <span className="box-load">
                        <Bar share={Math.min(1, worker.load)} />
                        <span className="ui-cell-faint">{worker.load.toFixed(2)}</span>
                      </span>
                      <span>
                        <Pill tone={tone}>{word}</Pill>
                      </span>
                      <span className="ui-cell-end">
                        <TextAction
                          disabled={acting.busy}
                          onClick={() =>
                            void acting.move(async () => {
                              await cordon(credentials, worker.worker, !worker.cordoned);
                              await reread();
                            })
                          }
                        >
                          {worker.cordoned ? "Uncordon" : "Cordon"}
                        </TextAction>
                      </span>
                    </TableRow>
                  );
                })}
              </>
            )}
          </Card>
        </>
      )}
    </Page>
  );
}

/** What a worker is in a word: the hub's own three standings, and quiet when it stopped saying. */
function standing(worker: Worker, quiet: boolean): [string, Tone] {
  if (quiet) return ["not heard from", "gray"];
  if (worker.draining) return ["draining", "amber"];
  return worker.cordoned ? ["cordoned", "amber"] : ["taking calls", "green"];
}
