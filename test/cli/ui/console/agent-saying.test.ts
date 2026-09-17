import type { Entry } from "@pinecall/protocol";
import { describe, expect, it } from "vitest";

import { agentSaying } from "../../../../src/cli/ui/console/screens/live/saying";

let seq = 0;
const entry = (type: string, data: Record<string, unknown>): Entry => ({ call: "call_1", seq: (seq += 1), ts: 0, type, data }) as unknown as Entry;
const word = (text: string, speech = "sp_1", timed = true): Entry =>
  entry("agent.transcript", { speech_id: speech, text, final: false, ...(timed ? { start: 0, end: 1 } : {}) });

describe("the words the agent is saying", () => {
  it("is every delta of the reply in flight, not the last one", () => {
    expect(agentSaying([word("Thanks"), word("for"), word("calling")])).toBe("Thanks for calling");
  });

  it("keeps the spacing a timed word brings of its own", () => {
    expect(agentSaying([word("Thanks "), word("for "), word("calling.")])).toBe("Thanks for calling.");
  });

  it("never splits a written reply's tokens into words nobody said", () => {
    expect(agentSaying([word("We clean", "sp_1", false), word("ing homes", "sp_1", false)])).toBe("We cleaning homes");
  });

  it("starts again after the turn that closed the last reply", () => {
    const log = [word("Hello"), entry("turn.agent", { speech_id: "sp_1", text: "Hello" }), word("Sure", "sp_2")];
    expect(agentSaying(log)).toBe("Sure");
  });

  it("is nothing once the turn is final, and nothing before anybody spoke", () => {
    expect(agentSaying([word("Hello"), entry("turn.agent", { speech_id: "sp_1", text: "Hello" })])).toBeNull();
    expect(agentSaying([])).toBeNull();
  });
});
