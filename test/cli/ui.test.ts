// `pinecall ui`: the console served on 127.0.0.1 under a nonce, the gateway's doors forwarded with
// the key this process holds, and the one thing that must never leave it — that key.

import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { headless } from "../../src/cli/ui/browser.js";
import { consoleFiles, ui } from "../../src/cli/ui/index.js";
import { LocalConsole } from "../../src/cli/ui/server.js";

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
