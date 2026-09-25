// `pinecall lexicon`: the org's words read, one added, some heard, some removed — each a whole
// set sent with the version it was read at — and the two hops of promote.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { linesOf, run } from "../../src/cli/lexicon.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_KEY = "pc_test_the_orgs_key";

const TEAM = {
  holder: "",
  version: 9,
  author: "m_carla",
  note: "said wrong all morning",
  set_at: 1758300000,
  lexicon: { said: [{ word: "GSA", spoken: "G S A" }], heard: ["Maravilla"] },
};

class FakeGateway {
  readonly bodies: unknown[] = [];
  #server!: Server;
  url = "";

  async open(): Promise<void> {
    this.#server = createServer((request, response) => void this.#answer(request, response));
    await new Promise<void>((bound) => this.#server.listen(0, "127.0.0.1", bound));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    if (text !== "") this.bodies.push(JSON.parse(text));
    response.writeHead(200, { "content-type": "application/json" });
    const path = request.url ?? "";
    const body = path.endsWith("/promote")
      ? { world: "production", holder: "", version: 4, run: null }
      : path.includes("/history")
        ? { world: "sandbox", holder: "", rows: [TEAM] }
        : { world: "sandbox", yours: null, team: TEAM, production: null };
    response.end(JSON.stringify(body));
  }
}

let gateway: FakeGateway;

beforeEach(async () => {
  gateway = new FakeGateway();
  await gateway.open();
});

afterEach(async () => {
  await gateway.close();
});

describe("the org's words", () => {
  it("prints what the corner reads and where every corner is", () => {
    const lines = linesOf({ world: "sandbox", yours: null, team: TEAM, production: null });

    expect(lines[0]).toBe("lexicon · sandbox");
    expect(lines).toContain('  said     GSA → "G S A"');
    expect(lines).toContain("  heard    Maravilla");
    expect(lines.at(-1)).toContain("team: v9 · m_carla");
  });

  it("adds a word over the whole set, with the version it read", async () => {
    await run(["add", "HUD", "--say", "H U D", "--team"], { out: written().stream, env: pointingAt(gateway.url, A_KEY) });

    expect(gateway.bodies.at(-1)).toEqual({
      lexicon: { said: [{ word: "GSA", spoken: "G S A" }, { word: "HUD", spoken: "H U D" }], heard: ["Maravilla"] },
      if_version: 9,
      note: null,
      team: true,
    });
  });

  it("hears more words once each, and removes a word from both lists", async () => {
    const env = pointingAt(gateway.url, A_KEY);
    await run(["hear", "Doral", "Maravilla", "--team"], { out: written().stream, env });
    expect((gateway.bodies.at(-1) as { lexicon: { heard: string[] } }).lexicon.heard).toEqual(["Maravilla", "Doral"]);

    await run(["rm", "GSA", "Maravilla", "--team"], { out: written().stream, env });
    expect((gateway.bodies.at(-1) as { lexicon: unknown }).lexicon).toEqual({ said: [], heard: [] });
  });
});

// The words were read off the corner this write lands on and the VERSION off `yours`, which is
// null for every key that holds no corner of its own — a server's token, a CI key, a supervisor
// acting in production. So the write carried the team's words with no version at all, and a door
// with nothing to check lets the second of two people saving at once win in silence (2026-09-20).
it("sends the version of the very corner it read the words from, with no corner of its own", async () => {
  await run(["add", "HUD", "--say", "H U D"], { out: written().stream, env: pointingAt(gateway.url, A_KEY) });

  const sent = gateway.bodies.at(-1) as { if_version: number | null; lexicon: { said: { word: string }[] } };
  expect(sent.if_version).toBe(9);
  expect(sent.lexicon.said.map((one) => one.word)).toEqual(["GSA", "HUD"]);
});
