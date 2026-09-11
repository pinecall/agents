/** The local server behind `pinecall ui`: the console's files and the gateway's doors, under one nonce on 127.0.0.1. */

import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import type { Door } from "../testing/gateway.js";
import type { OwnDoor } from "./doors.js";
import { Refusal, refusedAs } from "./refusal.js";

// Loopback only, and the kernel picks the port: nothing on the network can reach this console,
// and two `ui`s on one laptop do not fight over a number.
const LOOPBACK = "127.0.0.1";

// Everything answers under a random path — the console's files and, with them, the door to the
// gateway that this process opens with the org key. A process on this machine that scans the
// loopback finds a port; without the URL this process printed, it finds a 404 and nothing behind
// it. The key itself never leaves this process: the browser sends requests, this server signs them.
const NONCE_BYTES = 16;

// The gateway's doors, as the console asks for them relative to its base. Everything else under
// the nonce is a file of the console, or the console's page for a screen it routes itself.
const DOORS = "v1/";

// This process's OWN doors, beside the gateway's: what only the terminal that typed `ui` can do,
// because it stands in the agent's directory. Which ones there are is ui/doors.ts, and this
// server knows no more about them than their paths.
const OWN = "ui/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// The headers a browser's request carries that the gateway needs to see. Everything else — the
// cookies, the origin, the user agent — is the browser's business and stops here.
const FORWARDED = ["content-type", "accept", "last-event-id", "range"] as const;

/**
 * The console's server for the life of one command. Under its nonce it serves the built console
 * and forwards `v1/*` to the gateway with the org key on the header; outside the nonce it answers
 * 404 and nothing else. The key is a field of this object and is written into exactly one place:
 * the authorization header of a request this process makes.
 */
export class LocalConsole {
  readonly #server: Server;
  readonly #nonce: string;
  readonly #door: Door;
  readonly #files: string;
  readonly #own: OwnDoor[];
  #url = "";

  private constructor(door: Door, files: string, own: OwnDoor[]) {
    this.#door = door;
    this.#own = own;
    // Resolved, which is what strips a trailing separator: the directory arrives as a URL's path
    // and so ends in one, and `#serve` compares against `#files + sep`. Left as it came, that
    // comparison is `…/console//`, which no file under it starts with, and EVERY request fell
    // through to the page — including the bundle, which the browser then parsed as HTML.
    this.#files = resolve(files);
    this.#nonce = randomBytes(NONCE_BYTES).toString("hex");
    this.#server = createServer((request, response) => {
      void this.#answer(request, response);
    });
  }

  /** Bind the loopback on a free port and serve the console in `files` for this door. */
  static async open(door: Door, files: string, own: OwnDoor[] = []): Promise<LocalConsole> {
    const served = new LocalConsole(door, files, own);
    await served.#listen();
    return served;
  }

  /** Where the console is: the loopback, the port, the nonce. The one URL that answers anything. */
  get url(): string {
    return this.#url;
  }

  /** Where one screen of the console is, by the path the console routes. */
  at(path: string): string {
    return `${this.#url}${path.replace(/^\//, "")}`;
  }

  /** Close every socket and the port. After this, nothing answers at `url`. */
  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }

  async #listen(): Promise<void> {
    await new Promise<void>((bound, failed) => {
      this.#server.once("error", failed);
      this.#server.listen(0, LOOPBACK, bound);
    });
    const { port } = this.#server.address() as AddressInfo;
    this.#url = `http://${LOOPBACK}:${port}/${this.#nonce}/`;
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const asked = new URL(request.url ?? "/", this.#url);
    const under = `/${this.#nonce}/`;
    if (!asked.pathname.startsWith(under)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not here\n");
      return;
    }
    const path = asked.pathname.slice(under.length);
    if (path.startsWith(DOORS)) {
      await this.#forward(request, response, `/${path}${asked.search}`);
    } else if (path.startsWith(OWN)) {
      await this.#answerOwn(request, response, path);
    } else {
      this.#serve(response, path);
    }
  }

  // The doors this process answers itself, read off the table it was opened with. A refusal
  // travels as FastAPI's would — a status and a `detail` sentence — so the page reads both kinds
  // of door the same way.
  async #answerOwn(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
    const method = request.method ?? "GET";
    const door = this.#own.find((one) => `${OWN}${one.path}` === path);
    const answer = method === "GET" ? door?.get : method === "POST" ? door?.post : undefined;
    try {
      if (answer === undefined) throw new Refusal(404, `nothing at ${path}`);
      json(response, 200, await answer(JSON.parse((await whole(request)).toString() || "{}")));
    } catch (refused) {
      const said = refusedAs(refused);
      json(response, said.status, { detail: said.detail });
    }
  }

  // The one place the key is spent. The response streams back as it arrives, which is what a log
  // over SSE needs; a browser that navigates away aborts the request behind it.
  async #forward(request: IncomingMessage, response: ServerResponse, path: string): Promise<void> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.#door.apiKey}` };
    for (const name of FORWARDED) {
      const value = request.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
    // The response closing before it finished is the browser going away — a tab closed, a screen
    // left — and the door behind it is let go with it. (The request's own `close` is not that: it
    // fires the moment its body has been read.)
    const stopping = new AbortController();
    response.once("close", () => {
      if (!response.writableFinished) stopping.abort();
    });
    // A body the console sends is one JSON object, read whole before the door is asked: the
    // doors it writes to take a document, never a stream.
    const method = request.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? {} : { body: await whole(request) };
    let answered: Response;
    try {
      answered = await fetch(new URL(path, this.#door.url), { method, headers, signal: stopping.signal, ...body });
    } catch (failed) {
      if (stopping.signal.aborted) return;
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      response.end(`the gateway did not answer: ${failed instanceof Error ? failed.message : String(failed)}\n`);
      return;
    }
    const relayed: Record<string, string> = {
      "content-type": answered.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "no-store",
    };
    // A recording is served in byte ranges so a player can seek; those three headers are the
    // range's own and travel back with it.
    for (const name of ["content-range", "accept-ranges", "content-length"]) {
      const value = answered.headers.get(name);
      if (value !== null) relayed[name] = value;
    }
    response.writeHead(answered.status, relayed);
    if (answered.body === null) {
      response.end();
      return;
    }
    const relaying = Readable.fromWeb(answered.body as import("node:stream/web").ReadableStream);
    // The browser leaving mid-stream aborts the fetch, and the abort surfaces here as the body's
    // own error. It is the one way a stream is expected to end, not a failure of this process —
    // unheard, it was an uncaught exception that took the whole console down (2026-09-09).
    relaying.on("error", () => response.destroy());
    relaying.pipe(response);
  }

  // A path that names a file of the console is that file; every other path is a screen the console
  // routes itself, so it gets the page. Nothing above the console's directory is ever read.
  #serve(response: ServerResponse, path: string): void {
    const file = join(this.#files, normalize(`/${path}`));
    if (!file.startsWith(this.#files + sep) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(200, { "content-type": TYPES[".html"]!, "cache-control": "no-store" });
      response.end(this.#page());
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  }

  // Read on every request and not once: a console rebuilt while `ui` runs names new assets in a
  // new page, and a person reloading should get it. The page is served for every screen the
  // console routes itself, at any depth, so its assets are addressed from the base and not from
  // wherever the address bar happens to stand.
  #page(): string {
    return readFileSync(join(this.#files, "index.html"), "utf8").replace("<head>", `<head><base href="/${this.#nonce}/">`);
  }

}

/** One JSON answer, whole. */
function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": TYPES[".json"]!, "cache-control": "no-store" });
  response.end(`${JSON.stringify(body)}\n`);
}

/** Every byte of a request's body, as one buffer. */
async function whole(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}
