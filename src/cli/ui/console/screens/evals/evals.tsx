/** Evals: every run this agent's suites have scored, the diff between runs, and what its calls were sealed with. */

import type { ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";

import { CallsTable } from "./calls-table";
import { RunDetail } from "./run-detail";
import { RunTable } from "./run-table";
import { useEvalRuns } from "./use-eval-runs";
import { useScoredCalls } from "../../lib/use-scored-calls";
import "./evals.css";

// The URL carries every piece of this screen's state — `?view=` picks the half, `?run=` opens one
// run — so a regression is a link you can paste to whoever wrote it. Both halves read ONE agent,
// named by the path, and every door they open is that agent's.
export function Evals(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const [params, setParams] = useSearchParams();
  const runs = useEvalRuns(agent);
  const scored = useScoredCalls(agent);

  const view = params.get("view") === "calls" ? "calls" : "runs";
  const selected = params.get("run");
  const open = runs.runs.find((run) => run.id === selected) ?? null;

  const select = (next: Record<string, string | null>): void => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged);
  };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div className="page-eyebrow">{agent}</div>
        <h1 className="page-title">Evals</h1>
        <p className="page-lede">
          Every agent keeps goldens that grow with each card, and <code className="mono">pinecall test</code> is part
          of a milestone's definition of done. <strong>Runs</strong> is where those runs are readable without a
          terminal — every judgment per golden, per model, per run, and what changed since the run before.{" "}
          <strong>Calls</strong> is ring four: what the judges sealed each finished call with, within a minute of the
          caller hanging up.
        </p>
        <nav className="tabs" aria-label="View">
          <button type="button" className={view === "runs" ? "tab is-active" : "tab"} onClick={() => select({ view: null })}>
            runs
          </button>
          <button type="button" className={view === "calls" ? "tab is-active" : "tab"} onClick={() => select({ view: "calls", run: null })}>
            calls
          </button>
        </nav>
      </header>

      {view === "runs" && (
        <>
          <section className="section">
            <h2 className="section-title">Run a suite</h2>
            <div className="empty">
              <p className="empty-title">A run starts in the agent's directory, never here</p>
              <div className="empty-body">
                <p>
                  The goldens are the agent's own files, beside its class, so the suite is opened by the process that
                  holds them and scored by this gateway. A run appears below the moment it opens.
                </p>
                <code className="empty-cmd">pinecall test</code>
              </div>
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Runs</h2>
            {runs.error !== null && <p className="note note-warn">{runs.error}</p>}
            {runs.runs.length > 0 ? (
              <RunTable runs={runs.runs} selected={selected} onSelect={(id) => select({ run: id })} />
            ) : (
              <div className="empty">
                <p className="empty-title">{runs.reading ? "Reading…" : "No run has been stored yet"}</p>
                <div className="empty-body">
                  <p>A run appears here the moment one opens — from the command above, on a laptop or in CI.</p>
                </div>
              </div>
            )}
          </section>

          {open !== null && (
            <section className="section">
              <h2 className="section-title">
                {open.agent} · {open.id}
              </h2>
              <RunDetail run={open} before={runs.runs[runs.runs.indexOf(open) + 1]} />
            </section>
          )}
        </>
      )}

      {view === "calls" && (
        <section className="section">
          <h2 className="section-title">Scored calls</h2>
          {scored.error !== null && <p className="note note-warn">{scored.error}</p>}
          {scored.rows.length > 0 ? (
            <CallsTable agent={agent} rows={scored.rows} />
          ) : (
            <div className="empty">
              <p className="empty-title">No call of this agent has finished yet</p>
              <div className="empty-body">
                <p>The judges seal a call's log with its verdict when the caller hangs up; the first one lands here.</p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
