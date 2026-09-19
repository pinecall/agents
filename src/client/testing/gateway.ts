// A gateway that is not there: enough of the app socket to test an app's own agents, in process.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { CommandSchema, EPHEMERAL_EVENTS, type Command, type Entry, type EventType } from "@pinecall/protocol";
import { WebSocket, WebSocketServer } from "ws";

import { LOOPBACK } from "./loopback.js";

// The gateway answers a key nothing knows during the handshake, so the upgrade never happens.
const FORBIDDEN = 403;

/** What a fake gateway answers to, and what it hands back. */
export interface FakeGatewayOptions {
  /** The only key it accepts. Anything else is closed with 1008 and no body, like the real door. */
  apiKey?: string;
  /** Slugs this gateway refuses to register at all: the real one refuses a door another agent
   * already answers, or a slug another fleet is holding. */
  taken?: string[];
}

/** One command the fake gateway received, as it arrived. */
export type Received = Command;

/** One chunk this gateway answers a search with: what the real one reads off the base. */
export interface Scripted {
  path: string;
  heading: string | null;
  text: string;
}

/** One search an agent made through this gateway: for which call, what it asked, how many. */
export interface Searched {
  call: string;
  query: string;
  k: number | undefined;
}

// The one HTTP door this fake has: the search a class makes with `this.knowledge.search`. The
// real gateway runs it on the base; this one answers what the test scripted, under the same key.
const LOOKUP = /^\/v1\/calls\/([^/]+)\/lookup$/;

/**
 * A gateway with no session, no store and no model: it numbers entries, answers the three
 * commands the app socket answers itself, and lets a test push any entry it likes down the wire.
 *
 * It exists because the client's promise is that an app can be tested without a gateway, and a
 * promise like that has to be shipped, not re-written in every app's test folder.
 */
export class FakeGateway {
  readonly received: Received[] = [];
  /** Every search made through this gateway, in order. */
  readonly searched: Searched[] = [];
  readonly #http: Server;
  readonly #server: WebSocketServer;
  #found: Scripted[] = [];
  readonly #sockets = new Set<WebSocket>();
  readonly #refused: Set<string>;
  #seq = 0;
  #apps = 0;
  #port = 0;

  private constructor(http: Server, server: WebSocketServer, private readonly options: FakeGatewayOptions) {
    this.#http = http;
    this.#server = server;
    this.#refused = new Set(options.taken ?? []);
  }

  // The key is checked during the handshake, the way the real door checks it: a socket that never
  // opens is what a wrong key looks like from the app's side, not one that opens and shuts.
  /** Start one on a port nobody chose. Close it when the test is over. */
  static async start(options: FakeGatewayOptions = {}): Promise<FakeGateway> {
    // One HTTP server under both: the socket's upgrade at /v1/apps, and the search door beside it.
    const http = createServer((request, response) => void gateway.#answerHttp(request, response));
    const server = new WebSocketServer({
      server: http,
      path: "/v1/apps",
      verifyClient: ({ req }, done) => done(options.apiKey === undefined || req.headers.authorization === `Bearer ${options.apiKey}`, FORBIDDEN),
    });
    const gateway = new FakeGateway(http, server, options);
    // The address `url` hands out, and nothing wider. Without it the listener takes the IPv6
    // wildcard, which the kernel will grant on a port another program already holds on IPv4 —
    // and then the client's `127.0.0.1` connection is served by that program instead of by us.
    await new Promise<void>((resolve) => http.listen(0, LOOPBACK, resolve));
    const address = http.address();
    gateway.#port = typeof address === "object" && address !== null ? address.port : 0;
    server.on("connection", (socket) => gateway.#accept(socket));
    return gateway;
  }

  /** What a client should be given as its PINECALL_URL. */
  get url(): string {
    return `http://${LOOPBACK}:${this.#port}`;
  }

  /** How many apps are connected right now. */
  get connections(): number {
    return this.#sockets.size;
  }

  /** Every command of one type, in the order it arrived. */
  commandsOf(type: string): Received[] {
    return this.received.filter((command) => command.type === type);
  }

  /** Push one entry to every connected app, numbered as a store would number it. */
  emit(agent: string, call: string | null, type: EventType, data: Record<string, unknown>): Entry {
    const entry: Entry = { seq: (this.#seq += 1), ts: Date.now() / 1000, call, agent, type, ephemeral: EPHEMERAL_EVENTS.has(type), data };
    for (const socket of this.#sockets) {
      socket.send(JSON.stringify(entry));
    }
    return entry;
  }

  /** What the next searches answer: the chunks, best first, as the real gateway would read them off the base. */
  finds(chunks: Scripted[]): void {
    this.#found = chunks;
  }

  /** Drop every open socket without closing the door: what a gateway restart looks like. */
  cut(): void {
    for (const socket of this.#sockets) {
      socket.terminate();
    }
    this.#sockets.clear();
  }

  /**
   * Stop every connected app the way a member of the org does (`POST /v1/apps/{app}/stop`): an
   * `error` coded `stopped`, for no agent, and the socket closed after it.
   */
  stop(why: string): void {
    for (const socket of this.#sockets) {
      socket.send(JSON.stringify(this.#entry("", null, "error", { code: "stopped", message: why, recoverable: false })));
      socket.close();
    }
  }

  /** Stop listening and hang up on everybody. */
  async close(): Promise<void> {
    this.cut();
    await new Promise<void>((resolve, reject) => this.#server.close((failed) => (failed ? reject(failed) : resolve())));
    this.#http.closeAllConnections();
    await new Promise<void>((resolve, reject) => this.#http.close((failed) => (failed ? reject(failed) : resolve())));
  }

  async #answerHttp(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const call = LOOKUP.exec(request.url ?? "")?.[1];
    if (request.method !== "POST" || call === undefined) {
      response.writeHead(404).end();
      return;
    }
    if (this.options.apiKey !== undefined && request.headers.authorization !== `Bearer ${this.options.apiKey}`) {
      response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ detail: "this door takes an API key" }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const { input } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { input: { query: string; k?: number } };
    this.searched.push({ call: decodeURIComponent(call), query: input.query, k: input.k });
    const found = input.k === undefined ? this.#found : this.#found.slice(0, input.k);
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ output: { chunks: found }, took_ms: 1 }));
  }

  #accept(socket: WebSocket): void {
    this.#sockets.add(socket);
    // The id the real gateway mints per connection and hands back in `agent.registered`.
    const app = `app_${(this.#apps += 1)}`;
    socket.on("message", (raw: Buffer) => this.#take(socket, app, raw));
    socket.on("close", () => this.#sockets.delete(socket));
    // Node THROWS an `error` event nobody listens for, and `ws` raises one on this socket for any
    // frame it cannot parse — a confused client, or whatever else found the port. Without this
    // line one bad connection ends the whole test run instead of just itself.
    socket.on("error", () => this.#sockets.delete(socket));
  }

  #take(socket: WebSocket, app: string, raw: Buffer): void {
    const command = CommandSchema.parse(JSON.parse(raw.toString()) as unknown);
    this.received.push(command);
    switch (command.type) {
      case "agent.register":
        return this.#register(socket, app, command);
      case "agent.configure":
        return this.#answer(socket, command, "agent.configured", { changed: Object.keys((command.data["config"] ?? {}) as object) });
      case "ping":
        return this.#answer(socket, command, "pong", { ts: Date.now() / 1000 });
      default:
        return;
    }
  }

  // Many sockets may hold one agent, so a second register is answered like the first: what the
  // real registry refuses is a door another agent answers. `taken` is how a test asks for that.
  #register(socket: WebSocket, app: string, command: Command): void {
    if (this.#refused.has(command.agent)) {
      this.#refuse(socket, command, "refused", `${command.agent} answers at a door somebody else has`);
      return;
    }
    const { routes, sdk } = command.data as { routes: unknown; sdk?: string };
    this.#answer(socket, command, "agent.registered", sdk === undefined ? { routes, app } : { routes, app, sdk });
  }

  #answer(socket: WebSocket, command: Command, type: EventType, data: Record<string, unknown>): void {
    socket.send(JSON.stringify(this.#entry(command.agent, null, type, data)));
  }

  #refuse(socket: WebSocket, command: Command, code: string, message: string): void {
    const data: Record<string, unknown> = { code, message, recoverable: true, command: command.type };
    if (command.id !== undefined) {
      data["id"] = command.id;
    }
    socket.send(JSON.stringify(this.#entry(command.agent, null, "error", data)));
  }

  #entry(agent: string, call: string | null, type: EventType, data: Record<string, unknown>): Entry {
    return { seq: (this.#seq += 1), ts: Date.now() / 1000, call, agent, type, ephemeral: EPHEMERAL_EVENTS.has(type), data };
  }
}
