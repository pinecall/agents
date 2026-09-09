// An agent as the app holds it: the socket the gateway minted for it, which a caller may name.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";

const KEY = "pk_test";
const AGENT = "clinica-norte";

let gateway: FakeGateway;
let pc: Pinecall;

beforeEach(async () => {
  gateway = await FakeGateway.start({ apiKey: KEY });
  pc = new Pinecall({ url: gateway.url, apiKey: KEY });
});

afterEach(async () => {
  pc.close();
  await gateway.close();
});

describe("the socket an agent is held on", () => {
  it("has no id before the first register, because the gateway is the one that mints it", () => {
    expect(pc.agent(AGENT).app).toBeUndefined();
  });

  it("keeps the id agent.registered came back with, so a caller can ask to be served here", async () => {
    const agent = pc.agent(AGENT);

    await pc.connect();

    expect(agent.app).toBe("app_1");
  });
});
