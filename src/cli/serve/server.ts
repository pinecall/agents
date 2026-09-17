/** The local server behind `pinecall serve`: the console's files and the gateway's doors, on the loopback. */

import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import type { Door } from "../testing/gateway.js";

// Loopback only: nothing on the network can reach this console.
const LOOPBACK = "127.0.0.1";

/** The port a person remembers: `http://localhost:4100` is the sandbox's console on every laptop. */
export const DEFAULT_PORT = 4100;

/** Where a sidecar says what it is, so a `pinecall run` beside it can tell one from a stranger's port. */
export const ABOUT = "/.pinecall/serve";

// The gateway's doors, as the console asks for them. Everything else is a file of the console, or
// the console's page for a screen it routes itself.
const DOORS = "/v1/";

// The widget is the gateway's file too, and the console's Widget screen loads it from its own
// origin. It needs no key, so none is sent.
const WIDGET = "/widget/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

// The headers a browser's request carries that the gateway needs to see. Everything else — the
// cookies, the origin, the user agent — is the browser's business and stops here.
// `pinecall-corner` is an admin opening a colleague's copy: the gateway judges it, not this server.
const FORWARDED = ["content-type", "accept", "last-event-id", "range", "pinecall-corner"] as const;

// What the page reads to know it is this one and not the gateway's: no login, no key, the sandbox.
// And where the gateway is, for the one thing the page says about it: the widget's tag a site
// pastes loads from there, never from this loopback.
const marks = (gateway: string): string =>
  `<meta name="pinecall-console" content="local"><meta name="pinecall-gateway" content="${gateway.replace(/"/g, "&quot;")}">`;

/** What a sidecar answers at ABOUT: enough for another process to decide whether it is its own. */
export interface About {
  pinecall: "serve";
  gateway: string;
  org: string;
  env: string;
}

/**
 * The sandbox's console for as long as this process lives. It serves the built console and forwards
 * `/v1/*` to the gateway with the profile's key on the header. The key is a field of this object
 * and is written into exactly one place: the authorization header of a request this process makes.
 * The page holds none.
 *
 * The URL is stable on purpose, so nothing secret is in it. What keeps a stranger out is the two
 * headers a browser cannot forge for a page: `Host` must be this loopback (a DNS name rebound to
 * 127.0.0.1 arrives with its own), and `Origin`, when a browser sends one, must be this server's
 * (a page elsewhere asking this port is cross-origin, and is refused before the key is spent).
 */
export class LocalConsole {
  readonly #server: Server;
  readonly #door: Door;
  readonly #files: string;
  readonly #about: About;
  #port = 0;

  private constructor(door: Door, files: string, about: About) {
    this.#door = door;
    this.#about = about;
    // Resolved, which is what strips a trailing separator: the directory arrives as a URL's path
    // and so ends in one, and `#serve` compares against `#files + sep`. Left as it came, EVERY
    // request fell through to the page — including the bundle, which the browser parsed as HTML.
    this.#files = resolve(files);
    this.#server = createServer((request, response) => {
      void this.#answer(request, response);
    });
  }

  /** Bind the loopback on that port and serve the console in `files` for this door. Rejects when the port is taken. */
  static async open(door: Door, files: string, about: Omit<About, "pinecall">, port: number = DEFAULT_PORT): Promise<LocalConsole> {
    const served = new LocalConsole(door, files, { pinecall: "serve", ...about });
    await served.#listen(port);
    return served;
  }

  /** Where the console is, as a person types it. */
  get url(): string {
    return `http://localhost:${this.#port}`;
  }

  /** Close every socket and the port. After this, nothing answers at `url`. */
  async close(): Promise<void> {
    this.#server.closeAllConnections();
    await new Promise<void>((closed) => this.#server.close(() => closed()));
  }

  async #listen(port: number): Promise<void> {
    await new Promise<void>((bound, failed) => {
      this.#server.once("error", failed);
      this.#server.listen(port, LOOPBACK, bound);
    });
    this.#port = (this.#server.address() as AddressInfo).port;
  }

  async #answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.#fromThisMachinesOwnPage(request)) {
      response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      response.end("not from here\n");
      return;
    }
    const asked = new URL(request.url ?? "/", this.url);
    if (asked.pathname === ABOUT) {
      json(response, 200, this.#about);
    } else if (asked.pathname.startsWith(DOORS)) {
      await this.#forward(request, response, `${asked.pathname}${asked.search}`, true);
    } else if (asked.pathname.startsWith(WIDGET)) {
      await this.#forward(request, response, `${asked.pathname}${asked.search}`, false);
    } else {
      this.#serve(response, asked.pathname);
    }
  }

  #fromThisMachinesOwnPage(request: IncomingMessage): boolean {
    const here = new Set([`localhost:${this.#port}`, `${LOOPBACK}:${this.#port}`]);
    if (!here.has(request.headers.host ?? "")) return false;
    const origin = request.headers.origin;
    return origin === undefined || here.has(origin.replace(/^http:\/\//, ""));
  }

  // The one place the key is spent. The response streams back as it arrives, which is what a log
  // over SSE needs; a browser that navigates away aborts the request behind it.
  async #forward(request: IncomingMessage, response: ServerResponse, path: string, signed: boolean): Promise<void> {
    const headers: Record<string, string> = signed ? { authorization: `Bearer ${this.#door.apiKey}` } : {};
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
    // A recording is served in byte ranges so a player can seek; those headers are the range's own
    // and travel back with it. `content-length` does not: fetch has already decoded the body, so
    // the gateway's count of compressed bytes would cut the answer short.
    for (const name of ["content-range", "accept-ranges"]) {
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
    const file = join(this.#files, normalize(path));
    if (!file.startsWith(this.#files + sep) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(200, { "content-type": TYPES[".html"]!, "cache-control": "no-store" });
      response.end(this.#page());
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(response);
  }

  // Read on every request and not once: a console rebuilt while `serve` runs names new assets in a
  // new page, and a person reloading should get it.
  #page(): string {
    return readFileSync(join(this.#files, "index.html"), "utf8").replace("<head>", `<head>${marks(this.#about.gateway)}`);
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
