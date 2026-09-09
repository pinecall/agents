// Which golden's state a starting call opens in, and the loud line when it took the wrong one.

import { describe, expect, it } from "vitest";

import type { Call as SdkCall } from "../../../src/client/index.js";

import type { EvalRun } from "../../../src/cli/testing/gateway.js";
import type { Golden } from "../../../src/cli/testing/goldens.js";
import { A_CALLER, Openings, OUT_OF_ORDER } from "../../../src/cli/testing/seeding.js";

const GOLDENS: Golden[] = [
  { name: "identifica", input: ["hola"], state: { stage: "identify" } },
  { name: "ofrece", input: ["¿el martes?"], state: { stage: "choose" } },
];

function aCall(from: string): SdkCall {
  return { id: `CA_${from}`, from } as SdkCall;
}

function opened(names: string[]): EvalRun {
  return {
    id: "run_1",
    agent: "clinica-norte",
    started_at: 0,
    finished_at: 1,
    status: "done",
    calls: names.map((golden) => ({ golden, model: "haiku", call: `CA_${golden}` })),
    matrix: null,
    error: null,
  };
}

describe("the state a starting call opens in", () => {
  it("is the next golden's, in the order the runner opens them", () => {
    const openings = new Openings();
    openings.expects(GOLDENS, 1);

    expect(openings.opening(aCall(`${A_CALLER}one`))).toEqual({ stage: "identify" });
    expect(openings.opening(aCall(`${A_CALLER}two`))).toEqual({ stage: "choose" });
  });

  it("walks the goldens once per model, models outermost, as the runner does", () => {
    const openings = new Openings();
    openings.expects(GOLDENS, 2);

    const taken = ["a", "b", "c", "d"].map((one) => openings.opening(aCall(`${A_CALLER}${one}`)));

    expect(taken.map((state) => state?.["stage"])).toEqual([
      "identify",
      "choose",
      "identify",
      "choose",
    ]);
  });

  it("is nothing at all for a person who opened the chat door on the same app", () => {
    const openings = new Openings();
    openings.expects(GOLDENS, 1);

    expect(openings.opening(aCall("+34600000001"))).toBeUndefined();
    expect(openings.opening(aCall(`${A_CALLER}one`))).toEqual({ stage: "identify" });
  });
});

describe("the check that the seeds went where they were meant to", () => {
  it("says nothing when the run opened the goldens in the order they were handed out", () => {
    const openings = new Openings();
    openings.expects(GOLDENS, 1);
    openings.opening(aCall(`${A_CALLER}one`));
    openings.opening(aCall(`${A_CALLER}two`));

    expect(openings.mismatched(opened(["identifica", "ofrece"]))).toBeUndefined();
  });

  it("names both goldens when a call took a state that was not its own", () => {
    const openings = new Openings();
    openings.expects(GOLDENS, 1);
    openings.opening(aCall(`${A_CALLER}one`));
    openings.opening(aCall(`${A_CALLER}two`));

    const said = openings.mismatched(opened(["ofrece", "identifica"]));

    expect(said).toBe(OUT_OF_ORDER.replace("{said}", "ofrece").replace("{seeded}", "identifica"));
  });
});
