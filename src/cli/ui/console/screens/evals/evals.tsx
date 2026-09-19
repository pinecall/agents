/** Evals: the goldens and how they last held, run them from here, every run, the scored calls and the drift. */

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";

import { useCredentials } from "../../../shared/credentials";
import { dayAndTime } from "../../lib/format";
import { MODE } from "../../lib/mode";
import { useScoredCalls } from "../../lib/use-scored-calls";
import { Button, Card, CardHead, Empty, Page, PageHead, Pill, Refused, Segmented, Stat, Stats } from "../../ui";
import { CallsTable } from "./calls-table";
import type { EvalRun } from "./door";
import { DriftPanel } from "./drift-panel";
import { RunDetail } from "./run-detail";
import { RunTable } from "./run-table";
import { SuiteForm } from "./suite-form";
import { readGoldens, startSuite, type Listed, type Roster } from "./testing";
import { useEvalRuns } from "./use-eval-runs";
import "./evals.css";

const GOLDEN_COLUMNS = "minmax(0,1fr) 110px 90px";

type View = "runs" | "calls" | "drift";

/** What a golden checks, in one word the list can show: the first kind of expectation it carries. */
function kindOf(golden: Listed): string {
  const keys = Object.keys(golden.expect);
  if (keys.includes("tools") || keys.includes("not_tools")) return "tool call";
  if (keys.includes("says") || keys.includes("not")) return "exact phrase";
  if (keys.includes("grounded") || keys.includes("register")) return "judge";
  if (keys.includes("replies")) return "a reply";
  return keys.length === 0 ? "consent" : (keys[0] ?? "—");
}

/** Whether each golden held in a run: every judgment on it, under every model, held. */
function heldIn(run: EvalRun | undefined): Map<string, boolean> {
  const held = new Map<string, boolean>();
  for (const cell of run?.matrix?.runs ?? []) {
    const now = cell.scores.every((score) => score.passed);
    held.set(cell.golden, (held.get(cell.golden) ?? true) && now);
  }
  return held;
}

// The URL carries every piece of this screen's state — `?view=` picks the half, `?run=` opens one
// run — so a regression is a link you can paste to whoever wrote it. Every door is ONE agent's,
// named by the path.
export function Evals(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const credentials = useCredentials();
  const [params, setParams] = useSearchParams();
  const runs = useEvalRuns(agent);
  const scored = useScoredCalls(agent);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  // Running a suite is the workshop's: it goes through the class in a developer's directory. The
  // gateway's console reads what production's calls scored, and how that is drifting.
  const suites = MODE === "local";

  useEffect(() => {
    let gone = false;
    readGoldens(credentials, agent).then(
      (read) => {
        if (!gone) setRoster(read);
      },
      (failed: unknown) => {
        if (!gone) setAway(failed instanceof Error ? failed.message : String(failed));
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials, agent]);

  const asked = params.get("view");
  const view: View = asked === "calls" || asked === "drift" ? asked : asked === "runs" && suites ? "runs" : suites ? "runs" : "calls";
  const selected = params.get("run");
  const open = runs.runs.find((run) => run.id === selected) ?? null;
  const latest = runs.runs.find((run) => run.matrix !== null);
  const held = heldIn(latest);
  const goldens: Listed[] = roster !== null && roster.agent === agent ? roster.goldens : [];
  const names = goldens.length > 0 ? goldens.map((one) => one.name) : [...held.keys()];
  const passing = [...held.values()].filter(Boolean).length;
  const failing = held.size - passing;

  const select = (next: Record<string, string | null>): void => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged);
  };

  const runAll = async (): Promise<void> => {
    setStarting(true);
    setRefused(null);
    try {
      const opened = await startSuite(credentials, {
        agent,
        goldens: goldens.map((one) => one.name),
        voice: false,
      });
      select({ view: null, run: opened });
    } catch (failed) {
      setRefused(failed instanceof Error ? failed.message : String(failed));
    } finally {
      setStarting(false);
    }
  };

  const views: { value: View; label: string }[] = [
    ...(suites ? [{ value: "runs" as const, label: "Runs" }] : []),
    { value: "calls", label: "Scored calls" },
    { value: "drift", label: "Drift" },
  ];

  return (
    <Page width={1060} tight>
      <PageHead
        title="Evals"
        ledeWidth={620}
        lede="Golden sessions replayed against the agent as it is now. A golden is fixed and the agent is the variable: never soften a golden so a change can pass."
      />

      <Stats min={150}>
        <Stat size="small" label="Goldens" value={names.length === 0 ? "—" : names.length} />
        <Stat size="small" label="Passing" value={latest === undefined ? "—" : passing} tone={latest === undefined ? undefined : "green"} />
        <Stat size="small" label="Failing" value={latest === undefined ? "—" : failing} tone={latest === undefined || failing === 0 ? undefined : "red"} />
        <div className="ui-stat ui-stat-small">
          <div className="ui-stat-label">Last run</div>
          <div className="ev-last">{runs.runs[0] === undefined ? "never" : dayAndTime(runs.runs[0].started_at)}</div>
        </div>
      </Stats>

      <Card>
        <CardHead title="Golden questions">
          {suites && goldens.length > 0 && (
            <Button kind="primary" size="sm" className="ev-run-all" disabled={starting} onClick={() => void runAll()}>
              {starting ? "Opening…" : "Run all"}
            </Button>
          )}
        </CardHead>
        {names.length === 0 && (
          <Empty>
            {roster !== null && roster.agent !== agent
              ? roster.agent === null
                ? "No agent class in the directory the agent's `pinecall start` runs in, so no goldens to read."
                : `The process holding the agent runs in ${roster.agent}'s directory; its goldens are that agent's.`
              : away !== null && runs.runs.length === 0
                ? "The goldens are files beside the class, read by the process holding the agent — and no run has been stored yet to list them from."
                : "No goldens for this agent yet: write one in its goldens folder — test/goldens, or test/goldens/<name> in a project of several."}
          </Empty>
        )}
        <div className="ev-goldens">
          {names.map((name) => {
            const golden = goldens.find((one) => one.name === name);
            const standing = held.get(name);
            return (
              <div key={name} className="ui-table-row" style={{ gridTemplateColumns: GOLDEN_COLUMNS }}>
                <span className="ev-golden-says ui-clip" title={name}>
                  {golden?.input[0] ?? name}
                </span>
                <span className="ui-cell-faint">{golden === undefined ? "—" : kindOf(golden)}</span>
                <span className="ui-cell-end">
                  {standing === undefined ? <Pill tone="muted">not run</Pill> : standing ? <Pill tone="green">pass</Pill> : <Pill tone="red">fail</Pill>}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Refused>{refused}</Refused>

      <div className="ev-views">
        <Segmented
          options={views}
          value={view}
          onChange={(next) =>
            select({
              view: next === (suites ? "runs" : "calls") ? null : next,
              run: null,
            })
          }
        />
      </div>

      {view === "runs" && (
        <>
          {roster !== null && roster.agent === agent && goldens.length > 0 && <SuiteForm agent={agent} roster={roster} onOpened={(run) => select({ run })} />}
          <Card>
            <CardHead title="Runs" meta={`${runs.runs.length} · the same rows pinecall runs list prints`} />
            <Refused>{runs.error}</Refused>
            {runs.runs.length > 0 ? (
              <RunTable runs={runs.runs} selected={selected} onSelect={(id) => select({ run: id })} />
            ) : (
              <Empty>
                {runs.reading ? "Reading…" : "No run has been stored yet. A run appears here the moment one opens — from this page, a laptop or CI."}
              </Empty>
            )}
          </Card>
          {open !== null && <RunDetail run={open} before={runs.runs[runs.runs.indexOf(open) + 1]} />}
        </>
      )}

      {view === "drift" && <DriftPanel agent={agent} />}

      {view === "calls" && (
        <Card>
          <CardHead title="Scored calls" meta="the verdict is the call.score entry the log seals on" />
          <Refused>{scored.error}</Refused>
          {scored.rows.length > 0 ? (
            <CallsTable agent={agent} rows={scored.rows} />
          ) : (
            <Empty>
              No call of this agent has finished yet. The judges seal a call's log with its verdict when the caller hangs up; the first one lands here.
            </Empty>
          )}
        </Card>
      )}
    </Page>
  );
}
