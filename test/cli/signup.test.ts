// `pinecall signup`: the org made at the cloud, the key kept where every other verb looks for it,
// the console link printed once — and the two things that must never be printed, key and password.

import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gatewayFor } from "../../src/cli/credentials.js";
import { CLOUD_URL } from "../../src/cli/env.js";
import { signup } from "../../src/cli/signup.js";
import { written } from "./said.js";

const A_KEY = "pk_the_first_key_this_org_was_given";
const A_PASSWORD = "correct horse battery staple";
const WHO = ["--org", "tienda-sur", "--email", "ana@tiendasur.uy", "--person", "Ana"];

/** A gateway with one door: /v1/signup, which takes no key and answers the way the runtime does. */
class FakeCloud {
  readonly heard: { authorization: string | undefined; body: Record<string, unknown> }[] = [];
  cloud = true;
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
    if (request.url === "/.well-known/pinecall") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ version: "0.0.0", cloud: false, signup: this.cloud }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>;
    this.heard.push({ authorization: request.headers.authorization, body });
    if (!this.cloud) {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ detail: "this gateway takes no sign-ups: it is a box of its own, and its operator invites people" }));
      return;
    }
    response.writeHead(201, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        key: A_KEY,
        key_id: "k_1",
        org: "org_1",
        slug: "tienda-sur",
        env: "production",
        label: "cli",
        scopes: ["app", "calls"],
        subject: "m_1",
        name: "Ana",
        code: "lc_the_one_use_word",
        code_expires_at: "2026-09-12T06:00:00Z",
      }),
    );
  }
}

const cloud = new FakeCloud();
let home = "";

beforeEach(async () => {
  cloud.heard.length = 0;
  cloud.cloud = true;
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  await cloud.open();
});

afterEach(async () => {
  await cloud.close();
});

describe("signing up", () => {
  it("makes the org with no key at all, and keeps the one it is answered", async () => {
    const out = written();

    const code = await signup([cloud.url, ...WHO], { out: out.stream, env: { PINECALL_HOME: home }, password: async () => A_PASSWORD });

    expect(code).toBe(0);
    expect(cloud.heard[0]?.authorization).toBeUndefined();
    expect(cloud.heard[0]?.body).toMatchObject({ org: "tienda-sur", email: "ana@tiendasur.uy", person: "Ana", device: "cli" });
    expect(gatewayFor(cloud.url, home)).toMatchObject({ api_key: A_KEY, org: "org_1" });
  });

  it("says what now exists and how to open the console, and prints neither key nor password", async () => {
    const out = written();

    await signup([cloud.url, ...WHO], { out: out.stream, env: { PINECALL_HOME: home }, password: async () => A_PASSWORD });

    expect(out.text()).toContain("created org tienda-sur");
    expect(out.text()).toContain("signed in as Ana");
    expect(out.text()).toContain(`${cloud.url}/?login=lc_the_one_use_word`);
    expect(out.text()).not.toContain(A_KEY);
    expect(out.text()).not.toContain(A_PASSWORD);
  });

  it("goes to Pinecall's cloud when no gateway is named", async () => {
    const err = written();

    // Nothing is sent: the usage refuses before a door is chosen, and the usage names the cloud.
    const code = await signup([], { err: err.stream, env: { PINECALL_HOME: home } });

    expect(code).toBe(2);
    expect(err.text()).toContain("--org --email --person");
    expect(CLOUD_URL).toBe("https://box.pinecall.io");
  });

  it("says a gateway takes no sign-ups BEFORE asking for a password, and keeps nothing", async () => {
    cloud.cloud = false;
    const err = written();
    let asked = false;

    const code = await signup([cloud.url, ...WHO], {
      err: err.stream,
      env: { PINECALL_HOME: home },
      password: async () => {
        asked = true;
        return A_PASSWORD;
      },
    });

    expect(code).toBe(1);
    expect(err.text()).toContain("takes no sign-ups");
    expect(err.text()).toContain("PINECALL_SIGNUP");
    expect(asked).toBe(false);
    expect(cloud.heard).toEqual([]);
    expect(gatewayFor(cloud.url, home)).toBeUndefined();
  });

  it("makes nothing when no password was typed", async () => {
    const err = written();

    const code = await signup([cloud.url, ...WHO], { err: err.stream, env: { PINECALL_HOME: home }, password: async () => "  " });

    expect(code).toBe(2);
    expect(err.text()).toContain("nothing was made");
    expect(cloud.heard).toEqual([]);
  });

  it("writes the key once, in a file nobody else can read", async () => {
    await signup([cloud.url, ...WHO], { out: written().stream, env: { PINECALL_HOME: home }, password: async () => A_PASSWORD });

    const kept = readFileSync(join(home, "credentials"), "utf8");
    expect(kept.split(A_KEY)).toHaveLength(2);
    expect(kept).not.toContain(A_PASSWORD);
  });
});

describe("the key it kept, and what would shadow it", () => {
  it("says out loud that an exported key is read before the row just written", async () => {
    const err = written();

    await signup([cloud.url, ...WHO], {
      out: written().stream,
      err: err.stream,
      env: { PINECALL_HOME: home, PINECALL_API_KEY: "pk_another_orgs_key_exported_here" },
      password: async () => A_PASSWORD,
    });

    expect(err.text()).toContain("PINECALL_API_KEY is exported");
    expect(err.text()).toContain("unset PINECALL_API_KEY");
    expect(gatewayFor(cloud.url, home)).toMatchObject({ api_key: A_KEY });
  });

  it("says nothing when no key is exported to shadow it", async () => {
    const err = written();

    await signup([cloud.url, ...WHO], { out: written().stream, err: err.stream, env: { PINECALL_HOME: home }, password: async () => A_PASSWORD });

    expect(err.text()).toBe("");
  });
});
