// `pinecall login` and `pinecall whoami`: the key proved at the gateway before it is kept, the
// row written where the next verb looks, and the one thing that must never be printed — the key.

import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gatewayFor, writeGateway } from "../../src/cli/credentials.js";
import { login } from "../../src/cli/login.js";
import { describing, refusal, run as whoami } from "../../src/cli/whoami.js";
import { written } from "./said.js";

const A_KEY = "pk_the_orgs_own_key_nobody_will_deploy";

/** A gateway with one door: /v1/whoami, which knows one key and refuses every other. */
class FakeGateway {
  readonly heard: (string | undefined)[] = [];
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
    this.heard.push(request.headers.authorization);
    if (request.headers.authorization !== `Bearer ${A_KEY}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ detail: "this door takes an API key" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ org: "clinica", key_id: "k_1", label: "the laptop" }));
  }
}

const gateway = new FakeGateway();
let home = "";

beforeEach(async () => {
  gateway.heard.length = 0;
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  await gateway.open();
});

afterEach(async () => {
  await gateway.close();
});

describe("logging in to a gateway", () => {
  it("proves the key there, keeps it, and names the org rather than the key", async () => {
    const out = written();

    const code = await login([gateway.url], { out: out.stream, env: { PINECALL_HOME: home }, key: async () => A_KEY });

    expect(code).toBe(0);
    expect(out.text()).toBe(`logged in to ${gateway.url} as org clinica\n`);
    expect(out.text()).not.toContain(A_KEY);
    expect(gateway.heard).toEqual([`Bearer ${A_KEY}`]);
    expect(gatewayFor(gateway.url, home)).toMatchObject({ api_key: A_KEY, org: "clinica" });
  });

  it("keeps nothing when the gateway refuses, and prints the gateway's own sentence", async () => {
    const err = written();

    const code = await login([gateway.url], {
      err: err.stream,
      env: { PINECALL_HOME: home },
      key: async () => "pk_a_key_this_gateway_never_issued",
    });

    expect(code).toBe(1);
    expect(err.text()).toBe("the gateway answered 401: this door takes an API key\n");
    expect(gatewayFor(gateway.url, home)).toBeUndefined();
  });

  it("asks for a gateway rather than logging in to whatever was typed first", async () => {
    const err = written();

    expect(await login([], { err: err.stream, env: { PINECALL_HOME: home } })).toBe(2);
    expect(err.text()).toBe("usage: pinecall login <gateway-url> [--key-stdin]\n");
  });

  it("keeps nothing when nothing was typed", async () => {
    const err = written();

    const code = await login([gateway.url], { err: err.stream, env: { PINECALL_HOME: home }, key: async () => "  " });

    expect(code).toBe(2);
    expect(err.text()).toContain("nothing was kept");
    expect(gateway.heard).toEqual([]);
  });

  it("writes the key once, in a file nobody else can read", async () => {
    await login([gateway.url], { out: written().stream, env: { PINECALL_HOME: home }, key: async () => A_KEY });

    const kept = readFileSync(join(home, "credentials"), "utf8");
    expect(kept.split(A_KEY)).toHaveLength(2);
  });
});

describe("whoami", () => {
  it("prints the gateway, where the key came from, and what the gateway says the key is", async () => {
    writeGateway(gateway.url, { api_key: A_KEY, org: "clinica" }, home);
    const out = written();

    const code = await whoami([], out.stream, written().stream, { PINECALL_HOME: home, PINECALL_URL: gateway.url });

    expect(code).toBe(0);
    expect(out.text()).toBe(`gateway ${gateway.url} · key from credentials\norg clinica · key k_1 · the laptop\n`);
    expect(out.text()).not.toContain(A_KEY);
  });

  it("leaves with a one when the key it found opens nothing, in the gateway's words", async () => {
    const err = written();

    const code = await whoami([], written().stream, err.stream, {
      PINECALL_HOME: home,
      PINECALL_URL: gateway.url,
      PINECALL_API_KEY: "pk_a_key_this_gateway_never_issued",
    });

    expect(code).toBe(1);
    expect(err.text()).toBe("the gateway answered 401: this door takes an API key\n");
  });

  it("leaves a key with no label as two words rather than a dangling separator", () => {
    expect(describing({ org: "clinica", key_id: "k_1", label: null })).toBe("org clinica · key k_1");
  });

  it("prints what a refusal that is not the gateway's says, rather than swallowing it", () => {
    expect(refusal(new Error("fetch failed"))).toBe("fetch failed");
  });
});
