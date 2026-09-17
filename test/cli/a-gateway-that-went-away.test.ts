// A gateway restarting under `pinecall run` is a blip: one line, a redial, and what the gateway
// keeps only beside a live socket is said again. This pins the two pieces that decide it.

import { describe, expect, it } from "vitest";

import { FakeGateway } from "../../src/client/testing/index.js";
import { Pinecall } from "../../src/client/index.js";
import { aLostSocket } from "../../src/cli/run.js";

const KEY = "pk_test_key";

describe("a lost socket", () => {
  it("is told from the app's own failure", () => {
    expect(aLostSocket(new Error("Unexpected server response: 502"))).toBe(true);
    expect(aLostSocket(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(aLostSocket(new Error("the agenda has no such day"))).toBe(false);
  });
});

describe("every connect", () => {
  it("is heard once the agents are declared", async () => {
    const gateway = await FakeGateway.start({ apiKey: KEY });
    const pc = new Pinecall({ url: gateway.url, apiKey: KEY });
    pc.agent("clinica-norte");
    let connects = 0;
    pc.onConnected(() => {
      connects += 1;
    });

    await pc.connect();

    expect(connects).toBe(1);
    pc.close();
    await gateway.close();
  });
});
