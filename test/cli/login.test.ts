// `pinecall login` and `pinecall whoami`: the three a person knows turned into a key at the
// gateway, that key proved before it is kept, the row written where the next verb looks, and the
// one thing that must never be printed — the key.

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

const A_KEY = "pk_the_key_this_gateway_minted_for_ana";

// The three Ana knows. Nobody else's three open this gateway.
const ORG = "clinica";
const EMAIL = "ana@clinica.test";
const PASSWORD = "beachway";

// The one sentence the real door answers for a wrong org, a wrong email or a wrong password.
const NOBODY = "no member of clinica answers to that email and password";

/**
 * A gateway with the two doors `login` knocks at: `/v1/login`, which mints Ana's key for the three
 * she typed, and `/v1/whoami`, which knows that key and refuses every other.
 */
class FakeGateway {
  readonly heard: (string | undefined)[] = [];
  /** Every body `/v1/login` was sent, so a test can read what the terminal actually asked for. */
  readonly asked: Record<string, unknown>[] = [];
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
    this.heard.push(request.headers.authorization);
    if (request.url === "/v1/login") return this.#mint(await bodyOf(request), response);
    if (request.headers.authorization !== `Bearer ${A_KEY}`) {
      return refuse(response, 401, "this door takes an API key");
    }
    said(response, { org: ORG, key_id: "k_1", label: "the laptop", env: "development" });
  }

  #mint(body: Record<string, unknown>, response: ServerResponse): void {
    this.asked.push(body);
    if (body.org !== ORG || body.email !== EMAIL || body.password !== PASSWORD) {
      return refuse(response, 401, NOBODY);
    }
    said(response, { key: A_KEY, key_id: "k_1", org: ORG, env: body.env, label: body.device });
  }
}

async function bodyOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  return JSON.parse(text) as Record<string, unknown>;
}

function said(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function refuse(response: ServerResponse, status: number, detail: string): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ detail }));
}

const gateway = new FakeGateway();
let home = "";

/** A terminal with Ana at it: the two words in the open, the password in silence. */
function ana(password = PASSWORD): { aloud: (prompt: string) => Promise<string>; secret: () => Promise<string> } {
  return {
    aloud: (prompt: string) => Promise.resolve(prompt.startsWith("org") ? ORG : EMAIL),
    secret: () => Promise.resolve(password),
  };
}

beforeEach(async () => {
  gateway.heard.length = 0;
  gateway.asked.length = 0;
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  await gateway.open();
});

afterEach(async () => {
  await gateway.close();
});

describe("logging in to a gateway", () => {
  it("asks for the three a person knows and keeps the key the gateway mints for them", async () => {
    const out = written();

    const code = await login([gateway.url], { out: out.stream, env: { PINECALL_HOME: home }, ...ana() });

    expect(code).toBe(0);
    expect(out.text()).toBe(`logged in to ${gateway.url} as org clinica · development\n`);
    expect(gatewayFor(gateway.url, home)).toMatchObject({ api_key: A_KEY, org: "clinica" });
  });

  it("asks for a key of this laptop's own world, labelled as the terminal it was typed at", async () => {
    await login([gateway.url], { out: written().stream, env: { PINECALL_HOME: home }, ...ana() });

    expect(gateway.asked).toEqual([
      { org: ORG, email: EMAIL, password: PASSWORD, env: "development", device: "cli" },
    ]);
  });

  it("proves the minted key at whoami before keeping it, and prints neither it nor the password", async () => {
    const out = written();

    await login([gateway.url], { out: out.stream, env: { PINECALL_HOME: home }, ...ana() });

    expect(gateway.heard).toEqual([undefined, `Bearer ${A_KEY}`]);
    expect(out.text()).not.toContain(A_KEY);
    expect(out.text()).not.toContain(PASSWORD);
  });

  it("takes the two that are not secrets as flags, and asks only for the password", async () => {
    const asked: string[] = [];

    const code = await login([gateway.url, "--org", ORG, "--email", EMAIL], {
      out: written().stream,
      env: { PINECALL_HOME: home },
      aloud: (prompt: string) => {
        asked.push(prompt);
        return Promise.resolve("");
      },
      secret: () => Promise.resolve(PASSWORD),
    });

    expect(code).toBe(0);
    expect(asked).toEqual([]);
  });

  it("keeps nothing when the gateway refuses, and prints the gateway's own sentence", async () => {
    const err = written();

    const code = await login([gateway.url], {
      err: err.stream,
      env: { PINECALL_HOME: home },
      ...ana("not the one she chose"),
    });

    expect(code).toBe(1);
    expect(err.text()).toBe(`the gateway answered 401: ${NOBODY}\n`);
    expect(gatewayFor(gateway.url, home)).toBeUndefined();
  });

  it("asks for a gateway rather than logging in to whatever was typed first", async () => {
    const err = written();

    expect(await login([], { err: err.stream, env: { PINECALL_HOME: home } })).toBe(2);
    expect(err.text()).toBe("usage: pinecall login <gateway-url> [--org <slug>] [--email <you@…>] [--key-stdin]\n");
  });

  it("keeps nothing, and asks the gateway nothing, when nothing was typed", async () => {
    const err = written();

    const code = await login([gateway.url], {
      err: err.stream,
      env: { PINECALL_HOME: home },
      aloud: () => Promise.resolve("  "),
      secret: () => Promise.resolve(""),
    });

    expect(code).toBe(2);
    expect(err.text()).toContain("nothing was kept");
    expect(gateway.heard).toEqual([]);
  });

  it("says nobody is there rather than 'nothing was typed' when no terminal is attached", async () => {
    const err = written();

    const code = await login([gateway.url], { err: err.stream, env: { PINECALL_HOME: home } });

    expect(code).toBe(2);
    expect(err.text()).toContain("there is nobody to ask");
    expect(err.text()).toContain("--key-stdin");
    expect(gateway.heard).toEqual([]);
  });

  it("writes the key once, in a file nobody else can read", async () => {
    await login([gateway.url], { out: written().stream, env: { PINECALL_HOME: home }, ...ana() });

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
    expect(out.text()).toBe(`gateway ${gateway.url} · key from credentials\norg clinica · key k_1 · development · the laptop\n`);
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
    expect(describing({ org: "clinica", key_id: "k_1", label: null, env: "production" })).toBe("org clinica · key k_1 · production");
  });

  it("prints what a refusal that is not the gateway's says, rather than swallowing it", () => {
    expect(refusal(new Error("fetch failed"))).toBe("fetch failed");
  });
});
