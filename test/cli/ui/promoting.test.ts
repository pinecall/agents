// The console's promote door: a real call written down as a candidate, and what it will not write.

import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { promotingFrom } from "../../../src/cli/ui/promoting.js";
import { written } from "../said.js";

const CALL = "call_that_was_judged";

/** A gateway that answers one call's log: a turn, a state, and the verdict it was sealed with. */
class FakeGateway {
  entries: Record<string, unknown>[] = [];
  #server!: Server;
  url = "";

  async open(): Promise<void> {
    this.#server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ entries: this.entries, live: false, next: this.entries.length + 1 }));
    });
    await new Promise<void>((bound) => this.#server.listen(0, "127.0.0.1", bound));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }
}

let gateway: FakeGateway;

beforeEach(async () => {
  gateway = new FakeGateway();
  await gateway.open();
});

afterEach(async () => {
  await gateway.close();
  process.chdir(was);
});

const was = process.cwd();

function aJudgedCall(): Record<string, unknown>[] {
  return [
    { seq: 1, call: CALL, agent: "clinica-norte", type: "state.changed", data: { state: { stage: "identify" } } },
    { seq: 2, call: CALL, agent: "clinica-norte", type: "turn.user", data: { text: "quiero cambiar la cita" } },
    {
      seq: 3,
      call: CALL,
      agent: "clinica-norte",
      type: "call.score",
      data: { passed: true, judges: [{ name: "consent", verdict: "held", criteria: "", reason: "" }] },
    },
  ];
}

describe("promoting a call", () => {
  it("writes the candidate beside this directory's goldens and answers where it landed", async () => {
    gateway.entries = aJudgedCall();
    process.chdir(mkdtempSync(join(tmpdir(), "pinecall-candidates-")));
    const door = promotingFrom({ url: gateway.url, apiKey: "pk", world: "sandbox" }, "clinica-norte", written().stream);

    const promoted = await door.promote({ call: CALL });

    expect(promoted.path).toContain("test/candidates");
    expect(promoted.candidate.input).toEqual(["quiero cambiar la cita"]);
    expect(JSON.parse(readFileSync(promoted.path, "utf8"))).toMatchObject({ promoted_from: CALL });
  });

  // A candidate is derived from what the judges answered, so a call nobody judged has nothing to
  // derive one from — and the sentence says exactly that rather than writing an empty expect.
  it("refuses a call nobody judged, in the words the verb uses", async () => {
    gateway.entries = aJudgedCall().slice(0, 2);
    const door = promotingFrom({ url: gateway.url, apiKey: "pk", world: "sandbox" }, "clinica-norte", written().stream);

    await expect(door.promote({ call: CALL })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining("no verdict") as string,
    });
  });

  it("refuses when no class stands in this directory: a candidate has no goldens to join", async () => {
    const door = promotingFrom({ url: gateway.url, apiKey: "pk", world: "sandbox" }, null, written().stream);

    await expect(door.promote({ call: CALL })).rejects.toMatchObject({ status: 409 });
  });
});
