// A gateway that is not there: enough of the app socket to test an app's own agents, in process.

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

/**
 * A gateway with no session, no store and no model: it numbers entries, answers the three
 * commands the app socket answers itself, and lets a test push any entry it likes down the wire.
 *
 * It exists because the client's promise is that an app can be tested without a gateway, and a
 * promise like that has to be shipped, not re-written in every app's test folder.
 */
export class FakeGateway {
  readonly received: Received[] = [];
  readonly #server: WebSocketServer;
  readonly #sockets = new Set<WebSocket>();
  readonly #refused: Set<string>;
  #seq = 0;
  #apps = 0;
  #port = 0;

  private constructor(server: WebSocketServer, private readonly options: FakeGatewayOptions) {
    this.#server = server;
    this.#refused = new Set(options.taken ?? []);
  }

  // The key is checked during the handshake, the way the real door checks it: a socket that never
  // opens is what a wrong key looks like from the app's side, not one that opens and shuts.
  /** Start one on a port nobody chose. Close it when the test is over. */
  static async start(options: FakeGatewayOptions = {}): Promise<FakeGateway> {
    const server = new WebSocketServer({
      port: 0,
      // The address `url` hands out, and nothing wider. Without it the listener takes the IPv6
      // wildcard, which the kernel will grant on a port another program already holds on IPv4 —
      // and then the client's `127.0.0.1` connection is served by that program instead of by us.
      host: LOOPBACK,
      path: "/v1/apps",
      verifyClient: ({ req }, done) => done(options.apiKey === undefined || req.headers.authorization === `Bearer ${options.apiKey}`, FORBIDDEN),
    });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const gateway = new FakeGateway(server, options);
    const address = server.address();
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
