// `pinecall eval`: the door it knocks at, the lines it prints, and what it needs before it runs.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_URL, noKey } from "../../src/cli/env.js";
import { linesOf, replayUrl, run, type Answer } from "../../src/cli/eval.js";
import { onStderr } from "./said.js";

const ANSWERED: Answer = {
  call: "CA_8f4a2c",
  agent: "clinica-norte",
  passed: true,
  verdicts: [
    { check: "consent", status: "deferred", detail: "the confirmation gate is deferred (2026-09-06)" },
    { check: "latency", status: "passed", detail: "e2e_latency 1.040s <= 2.000s over 2 turns" },
  ],
};

describe("the door the verb knocks at", () => {
  it("is the replay door of the gateway this terminal points at", () => {
    expect(replayUrl("http://localhost:8080", "CA_8f4a2c")).toBe("http://localhost:8080/v1/evals/replay/CA_8f4a2c");
  });

  it("keeps one slash whatever the URL ended with, and escapes the id it was handed", () => {
    expect(replayUrl("http://box:8080/", "CA/8f")).toBe("http://box:8080/v1/evals/replay/CA%2F8f");
  });
});

describe("what a person reads", () => {
  it("puts the call on top and one aligned line per check", () => {
    expect(linesOf(ANSWERED)).toEqual([
      "CA_8f4a2c  clinica-norte",
      "  consent  deferred  the confirmation gate is deferred (2026-09-06)",
      "  latency  passed    e2e_latency 1.040s <= 2.000s over 2 turns",
    ]);
  });
});

describe("what eval needs before it can ask", () => {
  // A home with no profile in it is what a machine that has never logged in looks like, and the
  // refusal names the gateway it would have knocked at and the verb that keeps a key for it.
  it("names the gateway and `pinecall login` when this terminal holds no key at all", async () => {
    const previous = { home: process.env["PINECALL_HOME"] };
    process.env["PINECALL_HOME"] = mkdtempSync(join(tmpdir(), "pinecall-home-"));
    const said = onStderr();

    const code = await run(["CA_8f4a2c"]);

    said.restore();
    if (previous.home === undefined) delete process.env["PINECALL_HOME"];
    else process.env["PINECALL_HOME"] = previous.home;
    expect(code).toBe(2);
    expect(said.text()).toBe(`${noKey(DEFAULT_URL)}\n`);
  });

  it("asks for a call id rather than evaluating whatever was typed first", async () => {
    const said = onStderr();

    const code = await run([]);

    said.restore();
    expect(code).toBe(2);
    expect(said.text()).toContain("usage: pinecall eval <call-id>");
  });
});
