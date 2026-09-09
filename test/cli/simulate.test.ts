// The flags a simulation is asked for, and the exit code a scored call answers with.

import { describe, expect, it } from "vitest";

import { degradedBy, exitCodeOf } from "../../src/cli/simulate.js";
import { DEGRADED } from "../../src/cli/testing/voice.js";

describe("the degraded line", () => {
  it("is absent when neither flag was given: a run nobody spoiled is a clean line", () => {
    expect(degradedBy(undefined, undefined)).toBeUndefined();
  });

  it("takes the interferer's level in dB under the caller, as the hearing calls measured it", () => {
    expect(degradedBy("22", undefined)).toEqual({ interferer_db: 22, packet_loss: 0 });
  });

  it("reads packet loss as the percent a person types and sends the share the wire takes", () => {
    expect(degradedBy(undefined, "5")).toEqual({ interferer_db: DEGRADED.interferer_db, packet_loss: 0.05 });
  });

  it("puts the television at its measured level when --background-noise was given no number", () => {
    expect(degradedBy("", "2")?.interferer_db).toBe(DEGRADED.interferer_db);
  });
});

describe("the exit code", () => {
  it("is 2 when no call could be opened at all", () => {
    expect(exitCodeOf(undefined)).toBe(2);
  });

  it("is 0 for a call nobody was asked to judge", () => {
    expect(exitCodeOf({ call: "call_1" })).toBe(0);
  });

  it("is 0 when every judge held", () => {
    expect(exitCodeOf({ call: "call_1", score: { passed: true, judges: [], judge_calls: 0 } })).toBe(0);
  });

  it("is 1 when a judge answered broken", () => {
    expect(exitCodeOf({ call: "call_1", score: { passed: false, judges: [], judge_calls: 0 } })).toBe(1);
  });

  // An exit code is a gate, and "nobody looked at this call" must not open one — while the screen
  // above it says which of the three states it actually was.
  it("does not open the gate for a call nobody judged", () => {
    expect(exitCodeOf({ call: "call_1", score: { judges: [], judge_calls: 0 } })).toBe(1);
  });
});
