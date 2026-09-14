// `pinecall keys`: a key for a machine minted and printed the once, the org's rows read back as
// fingerprints, and one stopped — with the gateway's own sentence whenever it refuses.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { run } from "../../src/cli/keys.js";
import { pointingAt } from "./home.js";
import { written } from "./said.js";

const A_KEY = "pk_the_persons_own_key";

// What the gateway answers when one is issued: the only moment a key exists in the clear.
const MINTED = "pk_the_key_the_prod_server_will_run_on";

/** One request as the gateway heard it: the method, the path, and the body it was sent. */
interface Heard {
  method: string;
  path: string;
  body: unknown;
}

/** A gateway with the three tenant key doors, which knows one key and one org's rows. */
class FakeGateway {
  readonly heard: Heard[] = [];
  rows: unknown[] = [];
  refuse: { status: number; detail: string } | undefined;
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
    this.heard.push({ method: request.method ?? "", path: request.url ?? "", body: text === "" ? null : JSON.parse(text) });
    if (request.headers.authorization !== `Bearer ${A_KEY}`) return this.#said(response, 401, { detail: "this door takes an API key" });
    if (this.refuse !== undefined) return this.#said(response, this.refuse.status, { detail: this.refuse.detail });
    if (request.method === "GET") return this.#said(response, 200, this.rows);
    if ((request.url ?? "").endsWith("/revoke")) return this.#said(response, 200, { revoked: true });
    return this.#said(response, 200, { key: MINTED, key_id: "k_1", label: "prod server", env: "production", scopes: ["app"] });
  }

  #said(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }
}

const gateway = new FakeGateway();
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  gateway.heard.length = 0;
  gateway.rows = [];
  gateway.refuse = undefined;
  await gateway.open();
  env = pointingAt(gateway.url, A_KEY);
});

afterEach(async () => {
  await gateway.close();
});

describe("issuing one", () => {
  it("asks for a key that holds the app socket in production, and prints it once", async () => {
    const out = written();

    const code = await run(["issue", "--label", "prod server"], { out: out.stream, env });

    expect(code).toBe(0);
    expect(gateway.heard[0]).toMatchObject({ method: "POST", path: "/v1/keys", body: { label: "prod server" } });
    expect(out.text()).toContain(MINTED);
    expect(out.text()).toContain("production · prod server · app");
    expect(out.text()).toContain("never shown again");
  });

  it("says which world and which scopes when the person said them", async () => {
    await run(["issue", "--label", "ci", "--env", "sandbox", "--scope", "app", "--scope", "knowledge"], {
      out: written().stream,
      env,
    });

    expect(gateway.heard[0]?.body).toEqual({ label: "ci", env: "sandbox", scopes: ["app", "knowledge"] });
  });

  it("refuses a key with no label, and knocks at no door", async () => {
    const err = written();

    const code = await run(["issue"], { err: err.stream, env });

    expect(code).toBe(2);
    expect(err.text()).toContain("missing: --label");
    expect(gateway.heard).toEqual([]);
  });

  it("says the gateway's own sentence when the key cannot hand out what it does not open", async () => {
    gateway.refuse = { status: 403, detail: "this key cannot issue team: it does not open team itself" };
    const err = written();

    const code = await run(["issue", "--label", "a key", "--scope", "team"], { err: err.stream, env });

    expect(code).toBe(1);
    expect(err.text()).toContain("it does not open team itself");
  });
});

describe("reading them back", () => {
  it("prints fingerprints, worlds and whose each is, and never a key", async () => {
    gateway.rows = [
      { fingerprint: "9f2c1a4b7e0d5566", label: "prod server", env: "production", scopes: ["app"], subject: null, name: null, created_at: "2026-09-01", revoked_at: null },
      { fingerprint: "11aa22bb33cc4455", label: "laptop", env: "sandbox", scopes: ["app"], subject: "m_1", name: "Berna", created_at: "2026-09-02", revoked_at: "2026-09-09" },
    ];
    const out = written();

    const code = await run(["list"], { out: out.stream, env });

    expect(code).toBe(0);
    expect(out.text()).toContain("9f2c1a4b7e0d");
    expect(out.text()).toContain("a machine");
    expect(out.text()).toContain("Berna");
    expect(out.text()).toContain("revoked");
    expect(out.text()).not.toContain(MINTED);
  });

  it("says how to make the first one when the org has none", async () => {
    const out = written();

    await run(["list"], { out: out.stream, env });

    expect(out.text()).toContain("pinecall keys issue");
  });
});

// The listing prints twelve characters, because a full sha256 is unreadable in a column — and the
// door matches the whole hash, so `revoke <what list printed>` answered 404 for every key there
// was. Found by running it (2026-09-14). The word on the screen is the word that works.
describe("stopping one", () => {
  const ROWS = [
    { fingerprint: "9f2c1a4b7e0d5566", label: "prod server", env: "production", scopes: ["app"], subject: null, name: null, created_at: "2026-09-01", revoked_at: null },
    { fingerprint: "11aa22bb33cc4455", label: "laptop", env: "sandbox", scopes: ["app"], subject: "m_1", name: "Berna", created_at: "2026-09-02", revoked_at: null },
  ];

  it("takes the fingerprint `list` prints, and sends the whole one to the door", async () => {
    gateway.rows = ROWS;
    const out = written();

    const code = await run(["revoke", "9f2c1a4b7e0d"], { out: out.stream, env });

    expect(code).toBe(0);
    expect(gateway.heard.at(-1)).toMatchObject({ method: "POST", path: "/v1/keys/9f2c1a4b7e0d5566/revoke" });
    expect(out.text()).toBe("revoked 9f2c1a4b7e0d\n");
  });

  it("takes the whole fingerprint too, because that is what the runtime's CLI prints", async () => {
    gateway.rows = ROWS;

    expect(await run(["revoke", "9f2c1a4b7e0d5566"], { out: written().stream, env })).toBe(0);
    expect(gateway.heard.at(-1)).toMatchObject({ path: "/v1/keys/9f2c1a4b7e0d5566/revoke" });
  });

  it("names both when a word could be either, rather than picking one", async () => {
    gateway.rows = [ROWS[0]!, { ...ROWS[1]!, fingerprint: "9f2c1a4bFFFFFFFF" }];
    const err = written();

    const code = await run(["revoke", "9f2c1a4b"], { err: err.stream, env });

    expect(code).toBe(1);
    expect(err.text()).toContain("9f2c1a4b7e0d");
    expect(err.text()).toContain("9f2c1a4bFFFF");
  });

  it("says which verb lists them when no key of this org begins with that word", async () => {
    gateway.rows = ROWS;
    const err = written();

    const code = await run(["revoke", "deadbeef"], { err: err.stream, env });

    expect(code).toBe(1);
    expect(err.text()).toContain("no key of this org begins with deadbeef");
    expect(err.text()).toContain("pinecall keys list");
  });
});
