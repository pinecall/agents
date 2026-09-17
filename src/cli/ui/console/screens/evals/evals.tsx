/** Evals: run the goldens from here, read every run and the diff between two, and what its calls were sealed with. */

import type { ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";

import { CallsTable } from "./calls-table";
import { DriftPanel } from "./drift-panel";
import { RunDetail } from "./run-detail";
import { RunTable } from "./run-table";
import { SuiteForm } from "./suite-form";
import { useEvalRuns } from "./use-eval-runs";
import { MODE } from "../../lib/mode";
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

  const asked = params.get("view");
  // Running a suite is the workshop's: it goes through the class in a developer's directory. The
  // gateway's console reads what production's calls scored, and how that is drifting.
  const suites = MODE === "local";
  const view = asked === "calls" || asked === "drift" ? asked : suites ? "runs" : "calls";
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
          caller hanging up — and any of them can be re-checked by code or written down as a golden candidate.{" "}
          <strong>Drift</strong> is those verdicts counted over two windows, so a judge that started letting things
          through is a number and not a feeling.
        </p>
        <nav className="tabs" aria-label="View">
          {suites && (
            <button type="button" className={view === "runs" ? "tab is-active" : "tab"} onClick={() => select({ view: null })}>
              runs
            </button>
          )}
          <button type="button" className={view === "calls" ? "tab is-active" : "tab"} onClick={() => select({ view: suites ? "calls" : null, run: null })}>
            calls
          </button>
          <button type="button" className={view === "drift" ? "tab is-active" : "tab"} onClick={() => select({ view: "drift", run: null })}>
            drift
          </button>
        </nav>
      </header>

      {view === "runs" && (
        <>
          <section className="section">
            <h2 className="section-title">Run a suite</h2>
            <p className="suite-lede">
              The goldens are the agent's own files, beside its class, so the run is opened by the process that holds
              them — the terminal that typed <code className="mono">pinecall run</code>, exactly as{" "}
              <code className="mono">pinecall test</code> would — and scored by this gateway. Tick the ones to run; the
              run appears below the moment it opens, and every broken golden is written out where the verb writes it.
            </p>
            <SuiteForm agent={agent} onOpened={(run) => select({ run })} />
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

      {view === "drift" && <DriftPanel agent={agent} />}

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
