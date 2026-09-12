/** Fleet: every worker the hub has heard from, what it is carrying, and the cordon over it. */

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { Nothing } from "../../../shared/frame";
import { cordon, fleet, type TheFleet, type Worker } from "../../lib/doors";
import "./fleet.css";

// A heartbeat is not an event anybody can subscribe to: the hub hears one every few seconds and
// this page asks, on a clock of its own, for what it heard.
const EVERY_MS = 5_000;

/**
 * The screen.
 *
 * A cordon is the one thing this page does to a worker, and it takes nothing away: the worker
 * finishes the calls it holds and is handed no new one. Which is why it is the move before a
 * deploy, and why there is no button here that ends a call.
 */
export function Fleet(): ReactNode {
  const credentials = useCredentials();
  const [seen, setSeen] = useState<TheFleet | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const reread = useCallback(async (): Promise<void> => {
    try {
      setSeen(await fleet(credentials));
    } catch (failed) {
      setRefused(failed instanceof Error ? failed.message : String(failed));
    }
  }, [credentials]);

  useEffect(() => {
    void reread();
    const ticking = window.setInterval(() => void reread(), EVERY_MS);
    return () => window.clearInterval(ticking);
  }, [reread]);

  const turn = async (worker: string, wanted: boolean): Promise<void> => {
    setRefused(null);
    try {
      await cordon(credentials, worker, wanted);
      await reread();
    } catch (failed) {
      setRefused(failed instanceof GatewayError ? failed.message : String(failed));
    }
  };

  return (
    <section className="page">
      <div className="page-eyebrow fixed">fleet</div>
      <h1 className="page-title">Fleet</h1>
      <p className="page-lede">
        Every worker the hub has heard from. A cordoned worker finishes the calls it holds and is
        handed no new one — it is the move before a deploy, and it ends nothing.
      </p>

      {refused !== null && <p className="note note-warn">{refused}</p>}

      {seen !== null && seen.workers.length === 0 && (
        <Nothing>No worker has reported. A hub with none answers every call on itself.</Nothing>
      )}

      {seen !== null && seen.workers.length > 0 && (
        <ul className="panel workers">
          {seen.workers.map((worker) => {
            // The hub's own threshold, read off the answer: the page dims a worker at the very
            // moment the hub stops routing to it, and keeps no second copy of the number.
            const quiet = seen.now - worker.seen_at > seen.stale_after_s;
            return (
              <li className={quiet ? "worker worker-quiet" : "worker"} key={worker.worker}>
                <span className="fixed">{worker.worker}</span>
                <span className="worker-load fixed">
                  {worker.active}
                  {worker.max_jobs === null ? "" : ` / ${worker.max_jobs}`} calls
                </span>
                <span className="worker-load fixed">load {worker.load.toFixed(2)}</span>
                <span className="worker-standing fixed">{standing(worker, quiet)}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => void turn(worker.worker, !worker.cordoned)}
                >
                  {worker.cordoned ? "uncordon" : "cordon"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** What a worker is in one word: the hub's own three standings, and quiet when it stopped saying. */
function standing(worker: Worker, quiet: boolean): string {
  if (quiet) return "not heard from";
  if (worker.draining) return "draining";
  return worker.cordoned ? "cordoned" : "taking calls";
}
