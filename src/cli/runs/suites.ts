/** The suites this gateway has run, read back: one line each, one whole, and what moved between two. */

import { entriesOf, oneRun, theRuns, type Door, type EvalRun } from "../testing/gateway.js";
import { mediansOf } from "../testing/latency.js";
import { DECLARED, reportOf, type Latencies } from "../testing/matrix.js";
import { reasonOf } from "../testing/score.js";

/** How many runs `list` prints when nobody said: one screen of them, newest first. */
export const DEFAULT_LIMIT = 20;

/** One line per run, newest first: when, which agent, how it went, and how much of it held. */
export async function listed(
  door: Door,
  limit: number,
  asJson: boolean,
  out: NodeJS.WritableStream,
): Promise<number> {
  const runs = await theRuns(door, limit);
  if (asJson) {
    out.write(`${JSON.stringify({ runs })}\n`);
    return 0;
  }
  out.write(`${runs.map(lineOf).join("\n")}\n`);
  return 0;
}

/** One run, printed the way `pinecall test` printed it when it happened. */
export async function shown(
  door: Door,
  id: string,
  asJson: boolean,
  out: NodeJS.WritableStream,
): Promise<number> {
  const run = await oneRun(door, id);
  if (asJson) {
    out.write(`${JSON.stringify(run)}\n`);
    return 0;
  }
  const latencies: Latencies = {};
  for (const opened of run.calls) latencies[opened.call] = mediansOf(await entriesOf(door, opened.call));
  out.write(`${reportOf(run, latencies, DECLARED).join("\n")}\n`);
  return run.matrix !== null && run.matrix.failures.length > 0 ? 1 : 0;
}

/**
 * What moved between two runs, graph by graph. Only the cells that changed are printed: a diff of
 * two green runs is empty on purpose, and the one line that is not empty is the regression.
 */
export async function diffed(
  door: Door,
  before: string,
  after: string,
  out: NodeJS.WritableStream,
): Promise<number> {
  const [was, now] = [await oneRun(door, before), await oneRun(door, after)];
  const moved = movedBetween(was, now);
  out.write(`${[`${before} → ${after}`, ...(moved.length > 0 ? moved : ["  nothing moved"])].join("\n")}\n`);
  return moved.some((line) => line.includes("held → broken")) ? 1 : 0;
}

/** Every graph whose answer is not what it was, named as it moved. */
export function movedBetween(was: EvalRun, now: EvalRun): string[] {
  const lines: string[] = [];
  for (const cell of now.matrix?.runs ?? []) {
    const before = was.matrix?.runs.find(
      (one) => one.model === cell.model && one.golden === cell.golden,
    );
    for (const score of cell.scores) {
      const older = before?.scores.find((one) => one.metric === score.metric);
      if (older === undefined || older.passed === score.passed) continue;
      const way = older.passed ? "held → broken" : "broken → held";
      lines.push(`  ${cell.golden}  ${score.metric}  ${way}  ${reasonOf(score)}`);
    }
  }
  return lines;
}

// One run on one line: the id first, because the next thing a person types is `runs show <id>`.
function lineOf(run: EvalRun): string {
  const when = new Date(run.started_at * 1000).toISOString().slice(0, 19).replace("T", " ");
  const cells = run.matrix?.runs.length ?? run.calls.length;
  const broken = new Set((run.matrix?.failures ?? []).map((one) => `${one.model} ${one.golden}`)).size;
  return `${run.id}  ${when}  ${run.agent.padEnd(16)}  ${run.status.padEnd(7)}  ${cells - broken}/${cells}`;
}
