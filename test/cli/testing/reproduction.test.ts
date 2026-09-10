// A broken golden written out whole: what the model was asked, and everything that happened.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { Asked, Cell, Entry, EvalRun, Score } from "../../../src/cli/testing/gateway.js";
import type { Golden } from "../../../src/cli/testing/goldens.js";
import { whereTheyAre, writtenOut } from "../../../src/cli/testing/reproduction.js";

const A_VIEW = "<instructions>\nHablas con Ana García, ya en la ficha.\n</instructions>";
const A_CALL = "call_the_one_that_broke";

const ASKED: Asked[] = [
  {
    system: ["Eres la recepción de Clínica Norte."],
    messages: [{ role: "user", content: [{ type: "text", text: A_VIEW }] }],
    // The tools are part of the prompt: a call that ran none is judged on the list it had.
    tools: [{ type: "function", function: { name: "freeSlots" } }],
  },
];

const GOLDEN: Golden = {
  name: "ofrece-las-horas-del-martes",
  state: { stage: "choose" },
  input: ["¿Tiene algo el martes?"],
  expect: { tools: ["freeSlots"] },
};

const LOG: Entry[] = [
  { seq: 1, type: "call.started", data: {} },
  { seq: 7, type: "tools.changed", data: { visible: ["freeSlots"] } },
];

function score(metric: string, passed: boolean): Score {
  return { metric, score: passed ? 1 : 0, passed, reason: "ran no tool at all", criteria: "…", judge_calls: 0 };
}

function aRun(cells: Cell[]): EvalRun {
  return {
    id: "run_1",
    agent: "clinica-norte",
    started_at: 1000,
    finished_at: 1041,
    status: "done",
    calls: cells.map((one) => ({ golden: one.golden, model: one.model, call: A_CALL })),
    matrix: { models: ["haiku"], goldens: cells.map((one) => one.golden), metrics: ["tools"], judge_calls: 0, runs: cells, failures: [] },
    error: null,
  };
}

function cell(golden: string, passed: boolean, asked: Asked[] = ASKED): Cell {
  return { model: "haiku", golden, scores: [score("tools", passed)], summary: null, asked };
}

function under(): string {
  return mkdtempSync(join(tmpdir(), "pinecall-reproduction-"));
}

describe("a golden that broke is left on disk, whole", () => {
  it("writes nothing at all when every golden held", () => {
    const at = under();
    expect(writtenOut(aRun([cell("ofrece-las-horas-del-martes", true)]), [GOLDEN], {}, at)).toEqual([]);
  });

  it("writes one file per broken golden, under the run's own folder", () => {
    const at = under();

    const written = writtenOut(aRun([cell("ofrece-las-horas-del-martes", false)]), [GOLDEN], { [A_CALL]: LOG }, at);

    expect(written).toEqual([join(at, "run_1", "ofrece-las-horas-del-martes.json")]);
  });

  // The whole point of the file: the prompt is not in the log — `prompt.changed` carries a hash —
  // so a run that broke is the one reader that keeps the text, and it keeps the tools with it.
  it("carries the request the model answered, the tools it had, the golden and the log", () => {
    const at = under();

    const [path] = writtenOut(aRun([cell("ofrece-las-horas-del-martes", false)]), [GOLDEN], { [A_CALL]: LOG }, at);
    const written = JSON.parse(readFileSync(path!, "utf8")) as Record<string, unknown>;

    expect(written["asked"]).toEqual(ASKED);
    expect(written["declared"]).toEqual(GOLDEN);
    expect(written["log"]).toEqual(LOG);
    expect(written["call"]).toBe(A_CALL);
    expect(written["verdicts"]).toEqual([
      { metric: "tools", passed: false, criteria: "…", reason: "ran no tool at all" },
    ]);
  });

  it("names the folder once, however many goldens broke", () => {
    const at = under();

    const written = writtenOut(
      aRun([cell("ofrece-las-horas-del-martes", false), cell("no-inventa-horas-de-un-dia-sin-agenda", false)]),
      [GOLDEN],
      {},
      at,
    );

    expect(whereTheyAre(written)).toEqual([`  2 reproductions written to ${join(at, "run_1")}/`]);
  });

  it("says nothing when nothing was written", () => {
    expect(whereTheyAre([])).toEqual([]);
  });
});
