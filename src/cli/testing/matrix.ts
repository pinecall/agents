/** A finished run as a person reads it: a line per golden, the evidence under the ones that broke. */

import type { Cell, EvalRun, Matrix, Score } from "./gateway.js";
import { latencyLine, type Medians } from "./latency.js";
// The two marks a verdict wears, from the one module that defines them: a judge that held and one
// that did not mean the same thing here as they do on a call's own score.
import { BROKEN, HELD, reasonOf } from "./score.js";

// The column a conversation is drawn under when nobody named a model — the runner's own word for
// "whatever the agent declared". The report puts the class's own word in its place.
export const DECLARED = "declared";

/** The medians of each call the run opened, by call id: what `latency.ts` read off each log. */
export type Latencies = Record<string, Medians>;

/**
 * The whole report. `declaredAs` is what the tenant's class wrote — `llm = "haiku"` — so the
 * header names the model a person recognises instead of the runner's placeholder column.
 */
export function reportOf(run: EvalRun, latencies: Latencies, declaredAs: string): string[] {
  const matrix = run.matrix;
  if (matrix === null) return [`${run.agent}  ${run.status}${run.error === null ? "" : `: ${run.error}`}`];
  const models = matrix.models.map((model) => named(model, declaredAs));
  const counted = `${matrix.goldens.length} golden${matrix.goldens.length === 1 ? "" : "s"}`;
  const lines = [`${run.agent} · ${counted} · ${models.join(" · ")}`];
  // With two models each golden is drawn twice, so the model heads its own block; with one there
  // is nothing to head and the goldens sit directly under the line that already names it.
  const compared = matrix.models.length > 1;
  for (const model of matrix.models) {
    if (compared) lines.push(`  ${named(model, declaredAs)}`);
    for (const cell of matrix.runs.filter((one) => one.model === model)) {
      lines.push(...linesOfCell(cell, callOf(run, cell), latencies, compared));
    }
  }
  lines.push(...divergences(matrix, declaredAs), footer(run, matrix));
  // A run that stopped keeps the cells it had scored, so it has both a matrix and a reason. The
  // reason goes last, under the count: without it the footer reads as a score rather than as a
  // fragment — `8/20 held` of a suite whose app walked out after eight.
  if (run.error !== null) lines.push(`  ${run.error}`);
  return lines;
}

/** What the calls themselves cost in provider fees, summed from each one's own `call.summary`. */
function callCost(matrix: Matrix): number {
  return matrix.runs.reduce((total, cell) => total + (cell.summary?.cost?.eur ?? 0), 0);
}

// One golden under one model: the mark, its name, and — only when something broke — a line per
// judge that did not hold, and the call to open. A green golden is one line, because a suite of
// thirty green goldens must stay readable on one screen.
function linesOfCell(cell: Cell, call: string, latencies: Latencies, indented: boolean): string[] {
  const pad = indented ? "    " : "  ";
  const broken = cell.scores.filter((score) => !score.passed);
  const measured = latencyLine(latencies[call] ?? {});
  if (broken.length === 0) {
    return [`${pad}${HELD} ${cell.golden}${measured === "" ? "" : `  ${measured}`}`];
  }
  const width = Math.max(...broken.map((score) => score.metric.length), "log".length);
  return [
    `${pad}${BROKEN} ${cell.golden}`,
    ...broken.map((score) => `${pad}      ${score.metric.padEnd(width)}  broken   ${reasonOf(score)}`),
    `${pad}      ${"log".padEnd(width)}           ${call}`,
  ];
}

// The one thing a matrix is for: a golden two models do not agree about. Same judge, same golden,
// one model holding it and another not — printed on its own, because it is the finding.
function divergences(matrix: Matrix, declaredAs: string): string[] {
  if (matrix.models.length < 2) return [];
  const lines: string[] = [];
  for (const golden of matrix.goldens) {
    for (const metric of matrix.metrics) {
      const known = matrix.models
        .map((model) => ({ model, score: scoreAt(matrix, model, golden, metric) }))
        .filter((one) => one.score !== undefined);
      if (known.length < 2) continue;
      if (new Set(known.map((one) => one.score!.passed)).size === 1) continue;
      const said = known
        .map((one) => `${one.score!.passed ? HELD : BROKEN} ${named(one.model, declaredAs)}`)
        .join("   ");
      lines.push(`      ${golden}  ${metric}  ${said}`);
    }
  }
  return lines.length === 0 ? [] : ["  divergences", ...lines];
}

// The last line, and the one read first: how many held, what the judge was asked, what the calls
// cost, and how long a person waited for it.
function footer(run: EvalRun, matrix: Matrix): string {
  const cells = matrix.runs.length;
  const held = cells - new Set(matrix.failures.map((one) => `${one.model} ${one.golden}`)).size;
  const seconds = Math.round((run.finished_at ?? run.started_at) - run.started_at);
  const cost = callCost(matrix).toFixed(4);
  const asked = matrix.judge_calls;
  return `  ${held}/${cells} · ${asked} judge call${asked === 1 ? "" : "s"} · ${cost} EUR · ${seconds}s`;
}

function scoreAt(matrix: Matrix, model: string, golden: string, metric: string): Score | undefined {
  const cell = matrix.runs.find((one) => one.model === model && one.golden === golden);
  return cell?.scores.find((one) => one.metric === metric);
}

function callOf(run: EvalRun, cell: Cell): string {
  const opened = run.calls.find((one) => one.golden === cell.golden && one.model === cell.model);
  return opened?.call ?? "";
}

function named(model: string, declaredAs: string): string {
  return model === DECLARED ? declaredAs : model;
}
