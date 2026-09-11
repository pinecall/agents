// The table of the console's own doors: what it registers, and that it registers nothing else.

import { describe, expect, it } from "vitest";

import { ownDoors } from "../../../src/cli/ui/doors.js";
import { Refusal, refusedAs } from "../../../src/cli/ui/refusal.js";
import { Refused } from "../../../src/cli/testing/gateway.js";

describe("the table", () => {
  it("is empty when this console was opened with nothing of its own", () => {
    expect(ownDoors({})).toEqual([]);
  });

  it("registers one row per thing the terminal handed in, and nothing for what it did not", () => {
    const doors = ownDoors({
      chatting: {
        roster: async () => ({ agent: "clinica-norte", states: [] }),
        start: async () => ({ call: "c" }),
        say: async () => ({ call: "c" }),
        end: async () => ({ call: "c" }),
        close: async () => undefined,
      },
    });

    expect(doors.map((door) => door.path)).toEqual(["chat", "chat/say", "chat/end"]);
    expect(doors.find((door) => door.path === "chat/say")?.get).toBeUndefined();
    expect(doors.find((door) => door.path === "chat")?.get).toBeTypeOf("function");
  });
});

describe("what a refusal becomes", () => {
  // Three things reach the page through one shape, and the gateway's own words are the ones that
  // name the fix: "this gateway keeps no knowledge: it runs on a dev key" is an answer, and
  // `the gateway answered 503: {"detail":"…"}` around it is not.
  it("carries this process's own status, and the gateway's status and sentence unwrapped", () => {
    expect(refusedAs(new Refusal(409, "this console runs in clinica-norte's directory"))).toEqual({
      status: 409,
      detail: "this console runs in clinica-norte's directory",
    });
    expect(refusedAs(new Refused(503, JSON.stringify({ detail: "this gateway keeps no knowledge" })))).toEqual({
      status: 503,
      detail: "the gateway answered 503: this gateway keeps no knowledge",
    });
    expect(refusedAs(new Error("the socket closed"))).toEqual({ status: 500, detail: "the socket closed" });
  });
});
