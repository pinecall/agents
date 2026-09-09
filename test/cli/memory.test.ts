// `pinecall memory`: a contact's history, current facts first and the superseded ones dimmed with
// their date; and forget, which asks once and prints how many facts went.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { factLine, run } from "../../src/cli/memory.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_own_key";
const ANA = "+34600000001";

const CURRENT = { id: "f1", text: "prefiere que le llamen Ana", category: "preferencia", source: "CA_1", valid_from: 1_788_000_000, invalidated_at: null };
const GONE = { id: "f0", text: "prefiere que le llamen señora García", category: "preferencia", source: "CA_0", valid_from: 1_787_000_000, invalidated_at: 1_788_000_000 };

/** A gateway with the contact's memory door, which knows one key. */
class FakeGateway {
  readonly heard: { method: string; path: string }[] = [];
  facts: unknown[] = [];
  #server!: Server;
  url = "";

  async open(): Promise<void> {
    this.#server = createServer((request, response) => this.#answer(request, response));
    await new Promise<void>((bound) => this.#server.listen(0, "127.0.0.1", bound));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }

  #answer(request: IncomingMessage, response: ServerResponse): void {
    this.heard.push({ method: request.method ?? "", path: request.url ?? "" });
    response.writeHead(200, { "content-type": "application/json" });
    if (request.method === "DELETE") {
      response.end(JSON.stringify({ forgotten: this.facts.length }));
      return;
    }
    response.end(JSON.stringify({ facts: this.facts }));
  }
}

const gateway = new FakeGateway();
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  gateway.heard.length = 0;
  gateway.facts = [];
  await gateway.open();
  env = { PINECALL_URL: gateway.url, PINECALL_API_KEY: A_KEY };
});

afterEach(async () => {
  await gateway.close();
});

describe("a contact's history", () => {
  it("prints every fact, the current ones as they are and the superseded ones with their date", async () => {
    gateway.facts = [CURRENT, GONE];
    const out = written();

    const code = await run([ANA], { out: out.stream, env });

    expect(code).toBe(0);
    expect(gateway.heard[0]).toEqual({ method: "GET", path: `/v1/contacts/${encodeURIComponent(ANA)}/memory` });
    expect(out.text()).toBe(
      "- prefiere que le llamen Ana (preferencia)\n" +
        "- prefiere que le llamen señora García (preferencia) · until 2026-08-29 10:40\n",
    );
  });

  it("dims a superseded fact only on a terminal", () => {
    expect(factLine(GONE, true)).toBe("\u001b[2m- prefiere que le llamen señora García (preferencia) · until 2026-08-29 10:40\u001b[0m");
    expect(factLine({ ...CURRENT, category: null }, true)).toBe("- prefiere que le llamen Ana");
  });

  it("says so when nothing was kept", async () => {
    const out = written();

    await run([ANA], { out: out.stream, env });

    expect(out.text()).toBe(`nothing remembered about ${ANA}\n`);
  });

  it("prints the usage with no contact, and knocks at no door", async () => {
    const err = written();

    const code = await run([], { err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("usage: pinecall memory <contact>");
    expect(gateway.heard).toEqual([]);
  });
});

describe("forgetting a contact", () => {
  it("asks once, then deletes and prints how many facts went", async () => {
    gateway.facts = [CURRENT, GONE];
    const out = written();
    const asked: string[] = [];

    const code = await run(["forget", ANA], {
      out: out.stream,
      env,
      confirm: async (question) => {
        asked.push(question);
        return true;
      },
    });

    expect(code).toBe(0);
    expect(asked).toEqual([`forget everything memory kept about ${ANA}? [y/N] `]);
    expect(gateway.heard).toEqual([{ method: "DELETE", path: `/v1/contacts/${encodeURIComponent(ANA)}/memory` }]);
    expect(out.text()).toBe("forgotten: 2\n");
  });

  it("deletes nothing when the answer is no", async () => {
    const out = written();

    const code = await run(["forget", ANA], { out: out.stream, env, confirm: async () => false });

    expect(code).toBe(0);
    expect(gateway.heard).toEqual([]);
    expect(out.text()).toBe("nothing forgotten\n");
  });
});
