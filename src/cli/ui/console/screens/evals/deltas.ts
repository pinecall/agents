/** What changed between a run and the one before it: the judgments that broke, and those that healed. */

import type { EvalRun, Matrix } from "./door";

// A judgment belongs to one golden under one model, so that triple is what two runs are compared
// on. Nothing here averages anything: a delta NAMES the judgments that changed hands, because a
// number that went from 0.8 to 0.7 says nothing a person can act on and a name says everything.
const APART = " · ";

/** Which judgments broke since the previous run, and which of them hold again. */
export interface Delta {
  broke: string[];
  recovered: string[];
}

/** How much of a run held: a count of the judgments it carries, never a score of its own. */
export interface Tally {
  held: number;
  judgments: number;
}

/** One judgment named the way both runs name it: the golden, the model and the judge. */
function judgmentOf(model: string, golden: string, metric: string): string {
  return [golden, model, metric].join(APART);
}

/** How many of a run's judgments held. A run with no matrix has nothing to count. */
export function tallyOf(matrix: Matrix | null): Tally {
  if (matrix === null) {
    return { held: 0, judgments: 0 };
  }
  const judgments = matrix.runs.flatMap((cell) => cell.scores);
  return { held: judgments.filter((score) => score.passed).length, judgments: judgments.length };
}

// Only a judgment BOTH runs put is compared. One that the older run never put has nothing to have
// changed from, and calling it a regression would make every new golden a regression on the day it
// lands.
/** The change from `before` to `run`, or null when there is no earlier run to compare against. */
export function deltaBetween(run: EvalRun, before: EvalRun | undefined): Delta | null {
  if (before?.matrix == null || run.matrix === null) {
    return null;
  }
  const then = heldBy(before.matrix);
  const now = heldBy(run.matrix);
  const both = [...now.keys()].filter((judgment) => then.has(judgment));
  return {
    broke: both.filter((judgment) => then.get(judgment) === true && now.get(judgment) === false),
    recovered: both.filter((judgment) => then.get(judgment) === false && now.get(judgment) === true),
  };
}

/** Every judgment of a run, and whether it held. */
function heldBy(matrix: Matrix): Map<string, boolean> {
  const held = new Map<string, boolean>();
  for (const cell of matrix.runs) {
    for (const score of cell.scores) {
      held.set(judgmentOf(cell.model, cell.golden, score.metric), score.passed);
    }
  }
  return held;
}
