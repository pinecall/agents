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

  it("says nothing about a golden the older run never had and that held, rather than calling it a change", () => {
    const fresh: Cell = { ...HELD, golden: "nueva" };

    expect(movedBetween(aRun("a", [HELD]), aRun("b", [HELD, fresh]))).toEqual([]);
  });

  // `runs diff` said "nothing moved" over a run whose own `--json` listed failures: every cell of
  // it was new, so nothing was compared and nothing was printed (production, 2026-09-20).
  it("prints a broken measurement the older run never made, so no failure is silent", () => {
    const fresh: Cell = { ...BROKEN, golden: "nueva" };

    const moved = movedBetween(aRun("a", [HELD]), aRun("b", [HELD, fresh]));

    expect(moved).toHaveLength(1);
    expect(moved[0]).toContain("nueva  tools  not measured → broken");
  });

  it("names what the newer run stopped measuring, so a golden nobody ran is not read as a fix", () => {
    const moved = movedBetween(aRun("a", [BROKEN]), aRun("b", []));

    expect(moved).toEqual(["  reserva  tools  broken → not measured"]);
  });
});
