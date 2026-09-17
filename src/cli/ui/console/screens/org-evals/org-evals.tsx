/** Evals, for the whole org: how every agent's suites went, how its real calls were judged, and the calls that did not hold. */

import type { SessionLine } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";

import { GatewayError } from "../../../shared/api";
import { useCredentials } from "../../../shared/credentials";
import { ago, percent, whoOn } from "../../lib/format";
import { useOrg } from "../../lib/org";
import { Bar, Card, CardHead, Empty, Page, PageHead, Pill, Refused, Stat, Stats, TableHead, TableRow } from "../../ui";
import { readEveryRun, type EvalRun } from "../evals/door";
import "./org-evals.css";

const AGENT_COLUMNS = "minmax(0,1.2fr) minmax(0,1.3fr) 90px minmax(0,1fr) 80px";
const CALL_COLUMNS = "minmax(0,1fr) 150px 70px minmax(0,2fr) 90px";

interface AgentEvals {
  slug: string;
  /** The newest suite that finished, and how many of its cells held. */
  suite: { at: number; held: number; cells: number; failing: string[] } | null;
  judged: number;
  held: number;
}

/**
 * Two kinds of test, side by side. A SUITE is the goldens run on purpose (`pinecall test`, or Run
 * all on an agent's Evals tab); a JUDGED CALL is a real call scored at hang-up with nobody
 * watching. The first says whether a change is safe; the second says how it is going for real.
 */
export function OrgEvals(): ReactNode {
  const credentials = useCredentials();
  const { agents, lines } = useOrg();
  const [runs, setRuns] = useState<EvalRun[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    readEveryRun(credentials).then(
      (listed) => {
        if (!gone) setRuns(listed);
      },
      (failed: unknown) => {
        if (!gone) {
          setRuns([]);
          setRefused(failed instanceof GatewayError ? failed.message : String(failed));
        }
      },
    );
    return () => {
      gone = true;
    };
  }, [credentials]);

  const judgedLines = lines.filter((line) => line.score != null);
  const broken = judgedLines.filter((line) => line.score?.passed === false);
  const slugs = [...new Set([...agents.map((one) => one.slug), ...(runs ?? []).map((run) => run.agent), ...judgedLines.map((line) => line.agent)])].sort();
  const rows = slugs.map((slug) => evalsOf(slug, runs ?? [], judgedLines));
  const heldCalls = judgedLines.length - broken.length;
  const suites = rows.filter((row) => row.suite !== null);
  const green = suites.filter((row) => row.suite !== null && row.suite.held === row.suite.cells).length;

  return (
    <Page width={1060} tight>
      <PageHead title="Evals" lede="How every agent is doing: the suites run on purpose, and the real calls judged at hang-up." />
      <Refused>{refused}</Refused>

      <Stats min={170}>
        <Stat size="small" label="Calls judged" value={judgedLines.length} of={`of the last ${lines.length}`} />
        <Stat size="small" label="Held" value={judgedLines.length === 0 ? "—" : percent(heldCalls / judgedLines.length)} accent />
        <Stat size="small" label="Did not hold" value={broken.length} />
        <Stat size="small" label="Suites green" value={suites.length === 0 ? "—" : `${green} of ${suites.length}`} />
      </Stats>

      <Card>
        <CardHead title="By agent" meta="a row opens that agent's Evals: its goldens, its runs, its drift" />
        {rows.length === 0 ? (
          <Empty>No agent is held here yet.</Empty>
        ) : (
          <>
            <TableHead columns={AGENT_COLUMNS} labels={["Agent", "Last suite", "Judged", "Held on real calls", ""]} />
            {rows.map((row) => (
              <TableRow key={row.slug} columns={AGENT_COLUMNS} to={`/a/${row.slug}/evals`}>
                <span className="ui-cell-strong ui-clip">{row.slug}</span>
                <span className="ui-cell">
                  {row.suite === null ? (
                    <span className="oev-none">no suite run in this world</span>
                  ) : (
                    <>
                      <Pill tone={row.suite.held === row.suite.cells ? "green" : "red"}>
                        {row.suite.held}/{row.suite.cells}
                      </Pill>{" "}
                      <span className="oev-when">{ago(row.suite.at)}</span>
                    </>
                  )}
                </span>
                <span className="ui-cell-ink">{row.judged}</span>
                <span className="oev-held">
                  {row.judged === 0 ? (
                    <span className="oev-none">nothing judged yet</span>
                  ) : (
                    <>
                      <Bar share={row.held / row.judged} />
                      <span className="oev-share">{percent(row.held / row.judged)}</span>
                    </>
                  )}
                </span>
                <span className="ui-cell-end oev-open">Open →</span>
              </TableRow>
            ))}
          </>
        )}
      </Card>

      <Card>
        <CardHead title="Calls that did not hold" meta="a judge answered broken — the reason is the judge's own" />
        {broken.length === 0 ? (
          <Empty>{judgedLines.length === 0 ? "No call has been judged yet. Judging is turned on from Home." : "Every judged call held."}</Empty>
        ) : (
          <>
            <TableHead columns={CALL_COLUMNS} labels={["Caller", "Agent", "Score", "Why", "When>"]} />
            {broken.slice(0, 40).map((line) => (
              <TableRow key={line.call} columns={CALL_COLUMNS} to={`/sessions/${line.call}`}>
                <span className="ui-cell-strong ui-clip">{whoOn(line)}</span>
                <span className="ui-cell-ink ui-clip">{line.agent}</span>
                <span className="ui-cell">
                  <Pill tone="red">
                    {line.score?.held}/{line.score?.judged}
                  </Pill>
                </span>
                <span className="ui-cell ui-clip">{line.score?.reason ?? "—"}</span>
                <span className="ui-cell-faint ui-cell-end">{ago(line.started_at)}</span>
              </TableRow>
            ))}
          </>
        )}
      </Card>
    </Page>
  );
}

function evalsOf(slug: string, runs: EvalRun[], judged: SessionLine[]): AgentEvals {
  const finished = runs.find((run) => run.agent === slug && run.status === "done" && run.matrix !== null);
  const matrix = finished?.matrix ?? null;
  const mine = judged.filter((line) => line.agent === slug);
  return {
    slug,
    suite:
      finished === undefined || matrix === null
        ? null
        : {
            at: finished.started_at,
            cells: matrix.runs.length,
            held: matrix.runs.filter((cell) => cell.scores.every((score) => score.passed)).length,
            failing: [...new Set(matrix.failures.map((failure) => failure.golden))],
          },
    judged: mine.length,
    held: mine.filter((line) => line.score?.passed === true).length,
  };
}
