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

describe("a console's ask, relayed by the gateway as dev.request", () => {
  const until = async (found: () => boolean): Promise<void> => {
    for (let tries = 0; tries < 200 && !found(); tries += 1) await new Promise((wake) => setTimeout(wake, 5));
    expect(found()).toBe(true);
  };

  it("is answered with the handler's result under the gateway's own id", async () => {
    const agent = pc.agent(AGENT);
    agent.onDev(async (verb, data) => ({ verb, echoed: data }));
    await pc.connect();

    gateway.emit(AGENT, null, "dev.request", { id: "dev_1", verb: "knowledge.roster", data: { base_name: "x" } });
    await until(() => gateway.commandsOf("dev.answer").length === 1);

    const [answer] = gateway.commandsOf("dev.answer");
    expect(answer?.agent).toBe(AGENT);
    expect(answer?.data).toEqual({ id: "dev_1", result: { verb: "knowledge.roster", echoed: { base_name: "x" } } });
  });

  it("carries a DevRefused as the status and sentence, and anything else as a 500", async () => {
    const { DevRefused } = await import("../../src/client/index.js");
    const agent = pc.agent(AGENT);
    agent.onDev(async (verb) => {
      if (verb === "chat.start") throw new DevRefused(409, "this process runs in tienda-sur's directory");
      throw new Error("the disk is gone");
    });
    await pc.connect();

    gateway.emit(AGENT, null, "dev.request", { id: "dev_2", verb: "chat.start", data: {} });
    gateway.emit(AGENT, null, "dev.request", { id: "dev_3", verb: "drift.read", data: {} });
    await until(() => gateway.commandsOf("dev.answer").length === 2);

    const answers = gateway.commandsOf("dev.answer").map((command) => command.data);
    expect(answers).toContainEqual({ id: "dev_2", refused: { status: 409, detail: "this process runs in tienda-sur's directory" } });
    expect(answers).toContainEqual({ id: "dev_3", refused: { status: 500, detail: "the disk is gone" } });
  });

  it("tells a console that a plain app answers no dev verbs", async () => {
    pc.agent(AGENT);
    await pc.connect();

    gateway.emit(AGENT, null, "dev.request", { id: "dev_4", verb: "goldens.roster", data: {} });
    await until(() => gateway.commandsOf("dev.answer").length === 1);

    const [answer] = gateway.commandsOf("dev.answer");
    expect((answer?.data as { refused: { status: number } }).refused.status).toBe(501);
  });
});
