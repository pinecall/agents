// A log nobody stored: the two reading doors, over a list of entries a test appends to.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { EPHEMERAL_EVENTS, type Entry, type EventType } from "@pinecall/protocol";

import { LOOPBACK } from "./loopback.js";

/** A reader that is attached right now: where it got to, and where to write. */
interface Reader {
  after: number;
  response: ServerResponse;
}

/**
 * `GET /v1/calls/{id}/events` and `GET /v1/agents/{slug}/calls`, as a JSON page and as SSE.
 *
 * The cursor is the whole protocol, so this is the piece worth faking: `after` and
 * `Last-Event-ID` are the same number, and a reader that reconnects with a fresher one gets
 * exactly what it missed.
 */
export class FakeLog {
  readonly entries: Entry[] = [];
  readonly #server: Server;
  readonly #readers = new Set<Reader>();
  #port = 0;

  private constructor(server: Server) {
    this.#server = server;
  }

  /** Start one on a port nobody chose. Close it when the test is over. */
  static async start(): Promise<FakeLog> {
    const server = createServer();
    const log = new FakeLog(server);
    server.on("request", (request, response) => log.#serve(request, response));
    await new Promise<void>((resolve) => server.listen(0, LOOPBACK, resolve));
    const address = server.address();
    log.#port = typeof address === "object" && address !== null ? address.port : 0;
    return log;
  }

  /** What a client should be given as its PINECALL_URL. */
  get url(): string {
    return `http://${LOOPBACK}:${this.#port}`;
  }

  /** Append one entry, numbered as a store would number it, and push it to everybody attached. */
  append(agent: string, call: string | null, type: EventType, data: Record<string, unknown>): Entry {
    const entry: Entry = { seq: this.entries.length + 1, ts: Date.now() / 1000, call, agent, type, ephemeral: EPHEMERAL_EVENTS.has(type), data };
    this.entries.push(entry);
    for (const reader of this.#readers) {
      this.#push(reader, entry);
    }
    return entry;
  }

  /** Drop every attached reader mid-stream: what a deploy looks like to somebody reading. */
  cut(): void {
    for (const reader of this.#readers) {
      reader.response.end();
    }
    this.#readers.clear();
  }

  /** How many readers are attached right now. */
  get readers(): number {
    return this.#readers.size;
  }

  /** Stop listening and hang up on everybody. */
  async close(): Promise<void> {
    this.cut();
    await new Promise<void>((resolve, reject) => this.#server.close((failed) => (failed ? reject(failed) : resolve())));
  }

  #serve(request: IncomingMessage, response: ServerResponse): void {
    const url = new URL(request.url ?? "/", this.url);
    const of = matched(url.pathname);
    if (of === null) {
      response.writeHead(404).end();
      return;
    }
    const after = Number(request.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0);
    const mine = this.entries.filter((entry) => entry.seq > after && of(entry));
    if ((request.headers.accept ?? "").includes("text/event-stream")) {
      this.#attach(response, mine, after);
      return;
    }
    // A call's log is open until call.ended; an agent's never closes. The cursor is the last seq
    // this page carried, or the one the reader asked from when the page is empty and more follows.
    const live = !this.entries.some((entry) => of(entry) && entry.type === "call.ended");
    const last = mine.at(-1);
    const next = last !== undefined ? last.seq : live ? after : null;
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ entries: mine, live, next }));
  }

  #attach(response: ServerResponse, replay: Entry[], after: number): void {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    const reader: Reader = { after, response };
    for (const entry of replay) {
      this.#push(reader, entry);
    }
    this.#readers.add(reader);
    // No `error` listener here, unlike the gateway's socket, and that asymmetry is deliberate: a
    // broken reader destroys its `ServerResponse` first, and node drops an error on a destroyed
    // message instead of emitting it. `close` is the only event this door ever gets. See sdk.md.
    response.on("close", () => this.#readers.delete(reader));
  }

  #push(reader: Reader, entry: Entry): void {
    if (entry.seq <= reader.after) {
      return;
    }
    reader.after = entry.seq;
    reader.response.write(`id: ${entry.seq}\ndata: ${JSON.stringify(entry)}\n\n`);
  }
}

/** Which entries a path is asking for, or null when it is not one of the two doors. */
function matched(pathname: string): ((entry: Entry) => boolean) | null {
  const call = /^\/v1\/calls\/([^/]+)\/events$/.exec(pathname);
  if (call !== null) {
    return (entry) => entry.call === decodeURIComponent(call[1] as string);
  }
  const agent = /^\/v1\/agents\/([^/]+)\/calls$/.exec(pathname);
  if (agent !== null) {
    return (entry) => entry.agent === decodeURIComponent(agent[1] as string);
  }
  return null;
}
