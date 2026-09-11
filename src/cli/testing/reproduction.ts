/** A golden that broke, written out whole: what the model was asked, and everything that happened. */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Cell, Entry, EvalRun } from "./gateway.js";
import type { Golden } from "./goldens.js";

/** Where a broken golden is left, under the directory the suite was run in. One folder per run. */
export const REPRODUCTIONS = ".pinecall/evals";

/** What stands in for the requests when nobody kept them: the reason, not an empty list. */
export const NOT_RECORDED =
  "not recorded: this call's requests were built in the worker process, which a spoken run " +
  "drives over LiveKit. The log below is the whole of what this call left behind.";

/**
 * One file per broken golden, and nothing at all when the suite is green. It carries the four
 * things a person needs to disagree with a verdict without running anything: the golden as it was
 * written, the requests the model answered — the region order, the tool list, the view, verbatim —
 * the whole log of the call, and what each judge said. The prompt is here and nowhere else: the
 * log keeps a hash of each block on purpose (protocol/schema/events/prompt.changed.json), so a
 * run that is being reproduced is the one reader that asks the runtime for the text.
 */
export function writtenOut(
  run: EvalRun,
  goldens: Golden[],
  logs: Record<string, Entry[]>,
  under: string = REPRODUCTIONS,
): string[] {
  const broken = (run.matrix?.runs ?? []).filter((cell) => cell.scores.some((score) => !score.passed));
  if (broken.length === 0) return [];
  const folder = join(under, run.id);
  mkdirSync(folder, { recursive: true });
  return broken.map((cell) => {
    const call = callOf(run, cell);
    const path = join(folder, `${cell.golden}.json`);
    writeFileSync(path, `${JSON.stringify(aReproduction(run, cell, call, goldens, logs[call] ?? []), null, 2)}\n`);
    return path;
  });
}

/** One broken cell as a file: the declaration, the requests, the log, and every verdict on it. */
function aReproduction(
  run: EvalRun,
  cell: Cell,
  call: string,
  goldens: Golden[],
  log: Entry[],
): Record<string, unknown> {
  return {
    run: run.id,
    agent: run.agent,
    golden: cell.golden,
    model: cell.model,
    call,
    // The golden as it was written: the state it seeded, what the caller said, what it expected.
    declared: goldens.find((one) => one.name === cell.golden) ?? null,
    verdicts: cell.scores.map((score) => ({
      metric: score.metric,
      passed: score.passed,
      criteria: score.criteria,
      reason: score.reason,
    })),
    // In the order they went out: one per request, so a turn that ran a tool has more than one.
    // A spoken run builds its requests in the WORKER process and they never reach the runner, so
    // there the key is the sentence saying so and never an empty list: `tools: []` under a call
    // whose finding was "ran no tool at all" misled this project once already, and an `asked: []`
    // under a spoken break would read exactly the same way.
    asked: cell.asked === undefined || cell.asked.length === 0 ? NOT_RECORDED : cell.asked,
    log,
  };
}

/** The line the report prints under a broken golden, once, naming the folder and not each file. */
export function whereTheyAre(paths: string[]): string[] {
  if (paths.length === 0) return [];
  const folder = paths[0]!.slice(0, paths[0]!.lastIndexOf("/"));
  return [`  ${paths.length} reproduction${paths.length === 1 ? "" : "s"} written to ${folder}/`];
}

/** Which call a cell was answered by: the run names it when it opens, before the first turn. */
function callOf(run: EvalRun, cell: Cell): string {
  return run.calls.find((one) => one.golden === cell.golden && one.model === cell.model)?.call ?? "";
}

