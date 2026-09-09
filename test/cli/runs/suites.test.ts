// `pinecall runs diff`: what moved between two runs, and why an empty diff is the good news.

import { describe, expect, it } from "vitest";

import { movedBetween } from "../../../src/cli/runs/suites.js";
import type { Cell, EvalRun, Score } from "../../../src/cli/testing/gateway.js";

function score(metric: string, passed: boolean): Score {
  return { metric, score: passed ? 1 : 0, passed, reason: "the tool ran", criteria: "Every tool ran.", judge_calls: 0 };
}

function aRun(id: string, cells: Cell[]): EvalRun {
  return {
    id,
    agent: "clinica-norte",
    started_at: 0,
    finished_at: 1,
    status: "done",
    calls: [],
    matrix: { models: ["haiku"], goldens: [], metrics: [], judge_calls: 0, runs: cells, failures: [] },
    error: null,
  };
}

const HELD: Cell = { model: "haiku", golden: "reserva", scores: [score("tools", true)], summary: null };
const BROKEN: Cell = { model: "haiku", golden: "reserva", scores: [score("tools", false)], summary: null };

describe("what moved between two runs", () => {
  it("is the regression, named by the way it went", () => {
    const moved = movedBetween(aRun("a", [HELD]), aRun("b", [BROKEN]));

    expect(moved).toHaveLength(1);
    expect(moved[0]).toContain("reserva  tools  held → broken");
  });

  it("is empty between two runs that answered the same, which is why a diff is worth reading", () => {
    expect(movedBetween(aRun("a", [HELD]), aRun("b", [HELD]))).toEqual([]);
  });

  it("says nothing about a golden the older run never had, rather than calling it a change", () => {
    const fresh: Cell = { ...HELD, golden: "nueva" };

    expect(movedBetween(aRun("a", [HELD]), aRun("b", [HELD, fresh]))).toEqual([]);
  });
});
