// `pinecall ui`: the console served on 127.0.0.1 under a nonce, the gateway's doors forwarded with
// the key this process holds, and the one thing that must never leave it — that key.

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { headless } from "../../src/cli/ui/browser.js";
import type { Chatting } from "../../src/cli/ui/chatting.js";
import { ownDoors } from "../../src/cli/ui/doors.js";
import { consoleFiles, ui } from "../../src/cli/ui/index.js";
import { LocalConsole } from "../../src/cli/ui/server.js";
import { Refusal } from "../../src/cli/ui/refusal.js";
import type { Simulating } from "../../src/cli/ui/simulating.js";
import type { Testing } from "../../src/cli/ui/testing.js";

const KEY = "pk_the_org_key_that_stays_here";

/** A stream that keeps what was written, so a test reads a verb's output as a string. */
function collected(): { stream: NodeJS.WritableStream; text(): string } {
  const written: string[] = [];
  const stream = { write: (chunk: string) => written.push(chunk) } as unknown as NodeJS.WritableStream;
  return { stream, text: () => written.join("") };
}

/** A built console on disk: the page and one asset, which is all the server needs to know about. */
function aBuiltConsole(): string {
  const files = mkdtempSync(join(tmpdir(), "pinecall-console-"));
  mkdirSync(join(files, "assets"));
  writeFileSync(join(files, "index.html"), "<!doctype html><html><head><title>c</title></head><body></body></html>");
  writeFileSync(join(files, "assets", "app.js"), "console.log('the console')");
  return files;
}

/** A gateway that remembers how it was asked and answers two doors, one of them a stream. */
class FakeGateway {
  readonly heard: { path: string; authorization?: string | undefined; cookie?: string | undefined; body: string }[] = [];
  #server!: Server;
  url = "";

  async open(): Promise<void> {
    this.#server = createServer((request, response) => {
      void this.#answer(request, response);
    });
    await new Promise<void>((bound) => this.#server.listen(0, "127.0.0.1", bound));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }

  async #answer(request: IncomingMessage, response: import("node:http").ServerResponse): Promise<void> {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    this.heard.push({
      path: request.url ?? "",
      authorization: request.headers.authorization,
      cookie: request.headers.cookie,
      body,
    });
    // A call still going: the stream stays open until the reader leaves, the way a live log does.
    if (request.url?.startsWith("/v1/calls/call_open/events")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("event: turn.user\ndata: {\"seq\":1}\n\n");
      request.socket.once("close", () => response.destroy());
      return;
    }
    if (request.url?.startsWith("/v1/calls/call_1/events")) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("event: turn.user\ndata: {\"seq\":1}\n\n");
      response.end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ agents: [{ slug: "clinica-norte", channels: ["web"] }] }));
  }
}

describe("the server under the nonce", () => {
  const gateway = new FakeGateway();
  let served: LocalConsole;

  beforeEach(async () => {
    gateway.heard.length = 0;
    await gateway.open();
    served = await LocalConsole.open({ url: gateway.url, apiKey: KEY }, aBuiltConsole());
  });

  afterEach(async () => {
    await served.close();
    await gateway.close();
  });

  it("answers only under a 16-byte nonce, and 404 at the root", async () => {
    expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/$/);
    expect((await fetch(new URL("/", served.url))).status).toBe(404);
    expect((await fetch(new URL("/00000000000000000000000000000000/", served.url))).status).toBe(404);
  });

  it("serves the console's files, and the page for every screen the console routes", async () => {
    const asset = await fetch(`${served.url}assets/app.js`);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(await asset.text()).toContain("the console");

    const screen = await fetch(served.at("a/clinica-norte/calls"));
    expect(screen.headers.get("content-type")).toContain("text/html");
    expect(await screen.text()).toContain(`<base href="/${served.url.split("/")[3]}/">`);
  });

  // The defect this pins, found by opening the console on 2026-09-10: the directory arrives as a
  // URL's path and so ends in a separator, and `#serve` guarded with `files + sep` — which reads
  // `…/console//`, which no file under it starts with. Every request fell through to the page,
  // the bundle included, and the browser parsed a megabyte of JavaScript as HTML. The fixture
  // above hands a path with no trailing slash, which is a shape the real caller never produces.
  it("serves its files when the directory it was given ends in a separator", async () => {
    const trailing = await LocalConsole.open({ url: gateway.url, apiKey: KEY }, `${aBuiltConsole()}${sep}`);
    try {
      const asset = await fetch(`${trailing.url}assets/app.js`);
      expect(asset.headers.get("content-type")).toContain("text/javascript");
      expect(await asset.text()).toContain("the console");
    } finally {
      await trailing.close();
    }
  });

  it("forwards a door with the key on the header and nothing of the browser's", async () => {
    const answered = await fetch(`${served.url}v1/agents?limit=1`, { headers: { cookie: "session=browser" } });

    expect(await answered.json()).toEqual({ agents: [{ slug: "clinica-norte", channels: ["web"] }] });
    expect(gateway.heard).toEqual([{ path: "/v1/agents?limit=1", authorization: `Bearer ${KEY}`, cookie: undefined, body: "" }]);
  });

  it("forwards a body, and streams a door that streams", async () => {
    await fetch(`${served.url}v1/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "clinica-norte", scope: "talk" }),
    });
    expect(gateway.heard[0]?.body).toBe('{"agent":"clinica-norte","scope":"talk"}');

    const stream = await fetch(`${served.url}v1/calls/call_1/events?after=0`);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    expect(await stream.text()).toContain("event: turn.user");
  });

  it("survives a browser leaving a stream mid-way, and answers the next request", async () => {
    const left = new AbortController();
    const stream = await fetch(`${served.url}v1/calls/call_open/events?after=0`, { signal: left.signal });
    const reader = stream.body!.getReader();
    await reader.read();
    left.abort();
    await new Promise((settled) => setTimeout(settled, 50));

    const next = await fetch(`${served.url}v1/agents`);
    expect(next.status).toBe(200);
  });

  it("never serves anything above the console's directory", async () => {
    const outside = await fetch(`${served.url}../../etc/passwd`);
    expect(await outside.text()).not.toContain("root:");
  });

  it("answers nothing once closed", async () => {
    const url = served.url;
    await served.close();
    await expect(fetch(url)).rejects.toThrow();
    served = await LocalConsole.open({ url: gateway.url, apiKey: KEY }, aBuiltConsole());
  });
});

describe("the console's own doors", () => {
  const gateway = new FakeGateway();
  let served: LocalConsole;
  const simulating: Simulating = {
    roster: async () => ({ agent: "clinica-norte", personas: [{ name: "apurado", goal: "hoy", style: "rápido" }] }),
    start: async (wanted: unknown) => {
      const asked = wanted as { persona: string };
      if (asked.persona !== "apurado") throw new Refusal(404, `no persona called ${asked.persona}`);
      return { call: "call_sim" };
    },
  };

  const testing: Testing = {
    roster: async () => ({ agent: "clinica-norte", goldens: [{ name: "reserva", input: ["sí"], expect: { tools: ["book"] } }] }),
    start: async (wanted: unknown) => {
      const asked = wanted as { goldens: string[] };
      if (asked.goldens.includes("nadie")) throw new Refusal(404, "no golden called nadie");
      return { run: "run_ui" };
    },
  };

  // The chat door holds a socket per call in the terminal that typed `ui`; here it is a stub, and
  // what is being pinned is the server's half: which path is which verb, and how a refusal travels.
  const open = new Set<string>();
  const chatting: Chatting = {
    roster: async () => ({ agent: "clinica-norte", states: [] }),
    start: async () => {
      open.add("call_chat");
      return { call: "call_chat" };
    },
    say: async (asked: unknown) => {
      const said = asked as { call: string };
      if (!open.has(said.call)) throw new Refusal(404, `${said.call} is not a chat this console opened`);
      return { call: said.call };
    },
    end: async (asked: unknown) => ({ call: (asked as { call: string }).call }),
    close: async () => open.clear(),
  };

  beforeEach(async () => {
    await gateway.open();
    served = await LocalConsole.open({ url: gateway.url, apiKey: KEY }, aBuiltConsole(), ownDoors({ simulating, testing, chatting }));
  });
  afterEach(async () => {
    await served.close();
    await gateway.close();
  });

  it("lists this directory's personas without asking the gateway", async () => {
    const answer = await fetch(`${served.url}ui/personas`);
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({
      agent: "clinica-norte",
      personas: [{ name: "apurado", goal: "hoy", style: "rápido" }],
    });
    expect(gateway.heard).toEqual([]);
  });

  it("starts a simulation and answers the call to go and watch", async () => {
    const answer = await fetch(`${served.url}ui/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "clinica-norte", persona: "apurado" }),
    });
    expect(answer.status).toBe(200);
    expect(await answer.json()).toEqual({ call: "call_sim" });
  });

  it("carries a refusal as a status and a detail, the way the gateway's doors do", async () => {
    const answer = await fetch(`${served.url}ui/simulate`, {
      method: "POST",
      body: JSON.stringify({ agent: "clinica-norte", persona: "tranquilo" }),
    });
    expect(answer.status).toBe(404);
    expect(await answer.json()).toEqual({ detail: "no persona called tranquilo" });
  });

  it("lists this directory's goldens and starts a run of the ticked ones", async () => {
    const listed = await fetch(`${served.url}ui/goldens`);
    expect(await listed.json()).toEqual({
      agent: "clinica-norte",
      goldens: [{ name: "reserva", input: ["sí"], expect: { tools: ["book"] } }],
    });
    const started = await fetch(`${served.url}ui/test`, {
      method: "POST",
      body: JSON.stringify({ agent: "clinica-norte", goldens: ["reserva"] }),
    });
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ run: "run_ui" });
    const refused = await fetch(`${served.url}ui/test`, {
      method: "POST",
      body: JSON.stringify({ agent: "clinica-norte", goldens: ["nadie"] }),
    });
    expect(refused.status).toBe(404);
  });

  it("opens a written call, carries a turn down it, and refuses a call it never opened", async () => {
    expect(await (await fetch(`${served.url}ui/chat`)).json()).toEqual({ agent: "clinica-norte", states: [] });
    const opened = await fetch(`${served.url}ui/chat`, {
      method: "POST",
      body: JSON.stringify({ agent: "clinica-norte" }),
    });
    expect(await opened.json()).toEqual({ call: "call_chat" });
    const said = await fetch(`${served.url}ui/chat/say`, {
      method: "POST",
      body: JSON.stringify({ call: "call_chat", text: "hola" }),
    });
    expect(said.status).toBe(200);
    const stray = await fetch(`${served.url}ui/chat/say`, {
      method: "POST",
      body: JSON.stringify({ call: "call_nobody", text: "hola" }),
    });
    expect(stray.status).toBe(404);
    expect(gateway.heard).toEqual([]);
  });

  it("answers 404 for a door of its own it does not have, and for the wrong verb", async () => {
    expect((await fetch(`${served.url}ui/nothing`)).status).toBe(404);
    expect((await fetch(`${served.url}ui/simulate`)).status).toBe(404);
  });

  it("has no door of its own at all when it was opened with none", async () => {
    const bare = await LocalConsole.open({ url: gateway.url, apiKey: KEY }, aBuiltConsole());
    try {
      const answer = await fetch(`${bare.url}ui/personas`);
      expect(answer.status).toBe(404);
      expect(((await answer.json()) as { detail: string }).detail).toContain("nothing at ui/personas");
    } finally {
      await bare.close();
    }
  });
});

describe("before anything opens", () => {
  // The other half of the same evening: beside this module sits `console/` in the published package
  // and `console/` in a checkout, and only one of them is a browser's. The checkout's index.html
  // points at main.tsx, which no browser runs — a blank page, served happily, for as long as the
  // check was that the directory existed.
  it("picks the built console and never the sources beside it", () => {
    expect(basename(consoleFiles())).toBe("console");
    expect(existsSync(join(consoleFiles(), "main.tsx"))).toBe(false);
  });

  it("prints the usage for a flag it does not know", async () => {
    const out = collected();

    expect(await ui(["--help"], { out: out.stream, env: {} })).toBe(2);
    expect(out.text()).toBe("usage: pinecall ui [agent]\n");
  });

  it("asks for a key when neither is set", async () => {
    const err = collected();
    // An empty ~/.pinecall of its own: the machine running this may have logged in somewhere.
    const home = mkdtempSync(join(tmpdir(), "pinecall-home-"));

    expect(await ui(["clinica-norte"], { err: err.stream, env: { PINECALL_HOME: home } })).toBe(2);
    expect(err.text()).toContain("PINECALL_API_KEY");
  });

  it("refuses a headless machine before serving, and says why", async () => {
    const err = collected();
    let opened = false;

    const code = await ui(["clinica-norte"], {
      err: err.stream,
      env: { PINECALL_DEV_KEY: "dev", SSH_CONNECTION: "1.2.3.4 22" },
      open: () => (opened = true),
    });

    expect(code).toBe(2);
    expect(err.text()).toContain("ssh");
    expect(opened).toBe(false);
  });

  it("knows a Linux with no display from one with, and never refuses a Mac", () => {
    expect(headless({ DISPLAY: ":0" }, "linux")).toBeNull();
    expect(headless({}, "linux")).toContain("DISPLAY");
    expect(headless({}, "darwin")).toBeNull();
    expect(headless({ SSH_CONNECTION: "x" }, "darwin")).toContain("ssh");
  });
});
