// `pinecall start` and a deploy's SIGTERM: the process drains its agents, then leaves.

import { afterEach, expect, it } from "vitest";
import { Pinecall } from "../../src/client/index.js";
import { FakeGateway } from "../../src/client/testing/index.js";
import { drainLine, stream } from "../../src/cli/start-screens.js";

const KEY = "pk_test";

let gateway: FakeGateway | null = null;

afterEach(async () => {
  await gateway?.close();
  gateway = null;
});

async function started(holdsDrain = false): Promise<{ gateway: FakeGateway; running: Promise<number> }> {
  gateway = await FakeGateway.start({ apiKey: KEY, holdsDrain });
  const pc = new Pinecall({ url: gateway.url, apiKey: KEY });
  pc.onErrors(() => {});
  pc.agent("clinica-norte", {});
  const listening = process.listenerCount("SIGTERM");
  const running = stream(pc, () => () => {}).finally(() => pc.close());
  // Until the verb is listening for the signal: sent any earlier, nobody would hear it.
  while (process.listenerCount("SIGTERM") === listening) await new Promise((resolve) => setTimeout(resolve, 5));
  return { gateway, running };
}

it("drains every agent on SIGTERM before the socket closes, then leaves", async () => {
  const { gateway, running } = await started();
  process.emit("SIGTERM", "SIGTERM");
  expect(await running).toBe(0);
  expect(gateway.commandsOf("agent.drain")).toHaveLength(1);
});

it("leaves at once on a second signal while the drain waits", async () => {
  const { gateway, running } = await started(true);
  process.emit("SIGTERM", "SIGTERM");
  while (gateway.commandsOf("agent.drain").length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
  process.emit("SIGINT", "SIGINT");
  expect(await running).toBe(0);
});

it("says in one line where the calls went and what became of the tools", () => {
  expect(drainLine({ handed: 0, parked: 0, tools: 0, finished: 0 })).toBe("draining · no live calls");
  expect(drainLine({ handed: 1, parked: 2, tools: 2, finished: 1 })).toBe(
    "draining · 1 live call handed over · 2 live calls kept for the next process · 1 tool finished · 1 tool cut",
  );
});
