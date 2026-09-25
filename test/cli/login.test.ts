// `pinecall login` and `pinecall whoami`: the browser dance — a word this terminal asks for, a
// link the person opens, the key the page leaves behind — proved before it is kept, and never
// printed. The password is typed into a page and never into this process.

import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { login, signingIn } from "../../src/cli/login.js";
import { readSession, signedIn } from "../../src/cli/signed-in.js";
import { describing, refusal, run as whoami } from "../../src/cli/whoami.js";
import { written } from "./said.js";

const A_KEY = "pk_the_key_the_page_left_for_this_terminal";
const A_WORD = "cli_a_word_that_dies_in_ten_minutes";

/**
 * A gateway with the three doors the dance knocks at: the word, the key once somebody approved
 * the card, and whoami. It starts unapproved, because that is the state a terminal waits in.
 */
class FakeGateway {
  /** Every body `/v1/login/pairings` was sent, so a test can read what the terminal said it is. */
  readonly asked: Record<string, unknown>[] = [];
  approved = false;
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
    if (request.url === "/v1/login/pairings") {
      this.asked.push(await bodyOf(request));
      return said(response, 200, { code: A_WORD, expires_at: 0 });
    }
    if (request.url === `/v1/login/pairings/${A_WORD}/key`) {
      return this.approved ? said(response, 200, { key: A_KEY }) : said(response, 202, {});
    }
    // An instance of one world, with no sandbox beside it: a laptop's gateway, a box of one.
    if (request.url === "/.well-known/pinecall") return said(response, 200, { world: "production", elsewhere: null });
    if (request.headers.authorization !== `Bearer ${A_KEY}`) {
      return said(response, 401, { detail: "this door takes an API key" });
    }
    // `org` is the id every door takes and `slug` the word a person reads. They differ on an org
    // the box made, which is the case the line below exists to keep honest.
    said(response, 200, {
      org: "org_98889a61509c",
      slug: "clinica",
      key_id: "k_1",
      label: "the laptop",
      env: "production",
      name: "Berna",
      production: true,
    });
  }
}

async function bodyOf(request: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of request) text += String(chunk);
  return JSON.parse(text) as Record<string, unknown>;
}

function said(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const gateway = new FakeGateway();
let home = "";

/** A person who opens the link the moment it is printed. What a test hands in place of a browser. */
function opensIt(): { open: () => void; every: number } {
  return {
    every: 1,
    open: (): void => {
      gateway.approved = true;
    },
  };
}

beforeEach(async () => {
  gateway.asked.length = 0;
  gateway.approved = false;
  home = mkdtempSync(join(tmpdir(), "pinecall-home-"));
  await gateway.open();
});

afterEach(async () => {
  await gateway.close();
});

describe("signing a terminal in through a browser", () => {
  it("prints a link, opens it, waits, and signs this machine in as the person", async () => {
    const out = written();
    const person = opensIt();

    const code = await login([gateway.url], { out: out.stream, env: { PINECALL_HOME: home }, ...person });

    expect(code).toBe(0);
    expect(out.text()).toContain(signingIn(gateway.url, A_WORD));
    expect(out.text()).toContain(`signed in to ${gateway.url} as Berna`);
    expect(signedIn(undefined, home)).toEqual({ url: gateway.url, key: A_KEY });
  });

  it("opens the same link it printed, so a person on a server can paste it anywhere", async () => {
    const opened: string[] = [];

    await login([gateway.url], {
      out: written().stream,
      env: { PINECALL_HOME: home },
      every: 1,
      open: (url: string) => {
        opened.push(url);
        gateway.approved = true;
      },
    });

    expect(opened).toEqual([signingIn(gateway.url, A_WORD)]);
  });

  it("names this machine, so the card says what it signs in and the key is labelled by it", async () => {
    await login([gateway.url], { out: written().stream, env: { PINECALL_HOME: home }, ...opensIt() });

    expect(gateway.asked).toHaveLength(1);
    expect(gateway.asked[0]?.["device"]).toEqual(expect.any(String));
  });

  it("prints neither the key nor a password, because it never holds either", async () => {
    const out = written();

    await login([gateway.url], { out: out.stream, env: { PINECALL_HOME: home }, ...opensIt() });

    expect(out.text()).not.toContain(A_KEY);
  });

  it("writes the key once, in a file nobody else can read", async () => {
    await login([gateway.url], { out: written().stream, env: { PINECALL_HOME: home }, ...opensIt() });

    const file = join(home, "session.json");
    expect(readFileSync(file, "utf8").split(A_KEY)).toHaveLength(2);
    expect(statSync(file).mode & 0o077).toBe(0);
  });

  it("gives up in the person's words when nobody ever opens the link", async () => {
    const err = written();

    const code = await login([gateway.url], {
      out: written().stream,
      err: err.stream,
      env: { PINECALL_HOME: home },
      every: 1,
      until: 10,
      open: () => {},
    });

    expect(code).toBe(1);
    expect(err.text()).toContain("nobody approved this terminal");
    expect(readSession(home).gateways).toEqual({});
  });
});

describe("which gateway a login is for", () => {
  it("says nothing about a default in a real login that named one", async () => {
    const out = written();

    await login([gateway.url], { out: out.stream, env: { PINECALL_HOME: home }, ...opensIt() });

    expect(out.text()).not.toContain("the default");
  });
});

describe("whoami", () => {
  it("prints production's door and whose key it takes, and says there is no sandbox where none is named", async () => {
    const out = written();

    const code = await whoami([], out.stream, written().stream, { PINECALL_KEY: A_KEY, PINECALL_URL: gateway.url, PINECALL_HOME: home });

    expect(code).toBe(0);
    expect(out.text()).toBe(
      `gateway ${gateway.url} · key from the environment · production\n`
        + "  org clinica · key k_1 · production · the laptop · production: yes\n"
        + `sandbox: ${gateway.url} names no sandbox instance: run the verb with --prod, or ask its operator\n`,
    );
    expect(out.text()).not.toContain("org_98889a61509c");
    expect(out.text()).not.toContain(A_KEY);
  });

  it("leaves with a one when the key it found opens nothing, in the gateway's words", async () => {
    const err = written();

    const code = await whoami([], written().stream, err.stream, {
      PINECALL_KEY: "pc_a_key_this_gateway_never_issued",
      PINECALL_URL: gateway.url,
      PINECALL_HOME: home,
    });

    expect(code).toBe(1);
    expect(err.text()).toBe("production: the gateway answered 401: this door takes an API key\n");
  });

  it("leaves a key with no label as two words rather than a dangling separator", () => {
    expect(describing({ org: "clinica", key_id: "k_1", label: null, env: "production", production: true })).toBe(
      "org clinica · key k_1 · production · production: yes",
    );
  });

  it("says the id only when there is no slug: a gateway too old to carry one", () => {
    const old = { org: "org_98889a61509c", key_id: "k_1", label: null, env: "sandbox", production: false };

    expect(describing(old)).toBe("org org_98889a61509c · key k_1 · sandbox · production: no");
  });

  it("prints what a refusal that is not the gateway's says, rather than swallowing it", () => {
    expect(refusal(new Error("fetch failed"))).toBe("fetch failed");
  });
});
