// The client: one socket, the agents on it, and a door to any log the key can read.

import { createRequire } from "node:module";
import { hostname } from "node:os";
import { eventOf, type Camel, type CommandData, type CommandType, type Entry, type EventType } from "@pinecall/protocol";
import { Agent, type AgentGateway, type AgentOptions } from "./agent.js";
import type { Call } from "./calls.js";
import { Connection, type Backoff, type ConnectionOptions } from "./connection.js";
import { PinecallError, frame } from "./frames.js";
import { Listeners, asError, type AnyListener, type CamelEvent, type Listener } from "./listeners.js";
import { history, observe, type LogTarget, type Observation, type Page, type ReadOptions } from "./observe.js";
import type { World } from "./signed.js";

// Two levels up from dist/client/, and from src/client/ under a loader: the package's own manifest.
const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

// The code of the `error` a member of the org sends by stopping this app (`POST /v1/apps/{app}/stop`):
// the socket closes right after it, and the app stays closed — one that dialled back would stop nothing.
const STOPPED = "stopped";

/** Where the gateway is, who we are to it, and which world we hold our agents in. */
export interface PinecallOptions {
  url?: string;
  apiKey?: string;
  /**
   * The world, when the key is a person's: `production` is `pinecall start --prod`, and opens only
   * while their org lets them act there. A server's token was made for one world and needs none.
   */
  env?: World;
  pingMs?: number;
  backoff?: Partial<Backoff>;
}

/**
 * One app's connection to Pinecall.
 *
 * The gateway and the key are given, and this class reads NOTHING from the environment.
 *
 * It used to fall back to `PINECALL_URL` and `PINECALL_API_KEY`, and that second name was the
 * problem: v1's SDK exports it too, so a shell that still had v1's key live handed this client
 * another org's key and every call it made agreed — silently, because the name was the same.
 * Where a program keeps its own secret is the program's business; guessing at one is not this
 * class's, and a client pointed at a host nobody named fails later, where the app cannot read it.
 */
export class Pinecall implements AgentGateway {
  // `sdk` is the wire's field name for who is registering, so it is this object's too.
  readonly sdk = `pinecall/${version}`;
  /** The machine this process runs on, as the gateway lists it beside the app. */
  readonly host = hostname();
  /** The gateway this client talks to. */
  readonly url: string;
  /** The key it talks with. It travels in a header, never in a URL. */
  readonly apiKey: string;
  /** The world this client asks for, or undefined for the key's own answer. */
  readonly env: World | undefined;
  readonly #agents = new Map<string, Agent>();
  readonly #listeners: Listeners<Call | null>;
  readonly #errors = new Set<(error: Error) => void>();
  readonly #connects = new Set<() => void>();
  readonly #stops = new Set<(why: string) => void>();
  readonly #connection: Connection;

  constructor(options: PinecallOptions = {}) {
    const { url, apiKey } = options;
    if (url === undefined || apiKey === undefined) {
      throw new PinecallError("new Pinecall({ url, apiKey }): one of the two was not given");
    }
    this.url = url;
    this.apiKey = apiKey;
    this.env = options.env;
    this.#listeners = new Listeners<Call | null>((error) => this.onError(error));
    const dial: ConnectionOptions = { url, apiKey, ...(options.env === undefined ? {} : { env: options.env }) };
    if (options.pingMs !== undefined) {
      dial.pingMs = options.pingMs;
    }
    if (options.backoff !== undefined) {
      dial.backoff = options.backoff;
    }
    this.#connection = new Connection(dial, {
      onOpen: () => this.#declareAll(),
      onEntry: (entry) => this.#take(entry),
      onError: (error) => this.onError(error),
      onHeartbeat: () => this.#pingAll(),
    });
  }

  /** Declare an agent this app speaks for. Nothing is sent until `connect`. */
  agent(slug: string, options: AgentOptions = {}): Agent {
    const agent = new Agent(slug, options, this);
    this.#agents.set(slug, agent);
    return agent;
  }

  /** Open the socket, claim every agent's slug and doors, and send every declaration. */
  async connect(): Promise<void> {
    await this.#connection.start();
  }

  /** Close the socket and stay closed. Every agent's slug is free the moment it shuts. */
  close(): void {
    this.#connection.close();
  }

  /** True while the socket is up. */
  get connected(): boolean {
    return this.#connection.open;
  }

  /** Listen for one event type across every agent on this client. */
  on<K extends EventType>(type: K, listener: Listener<K, Call | null>): () => void {
    return this.#listeners.on(type, listener);
  }

  /** Listen for every event across every agent. */
  onAny(listener: AnyListener<Call | null>): () => void {
    return this.#listeners.onAny(listener);
  }

  /**
   * Hear every time the socket is up with every agent declared on it: the first connect, and each
   * reconnect after a gateway that went away. What a gateway keeps only beside a live socket is
   * said again from here.
   */
  onConnected(listener: () => void): () => void {
    this.#connects.add(listener);
    return () => {
      this.#connects.delete(listener);
    };
  }

  /**
   * Hear that a member of the org stopped this app. The socket is closed and stays closed, every
   * agent's slug is free, and what the app does next — exit, most often — is the app's.
   */
  onStopped(listener: (why: string) => void): () => void {
    this.#stops.add(listener);
    return () => {
      this.#stops.delete(listener);
    };
  }

  /** Hear what the client could not hand to anybody: a bad frame, a tool that threw, a lost socket. */
  onErrors(listener: (error: Error) => void): () => void {
    this.#errors.add(listener);
    return () => {
      this.#errors.delete(listener);
    };
  }

  /** A log as it happens, folded by the protocol's reducer. */
  observe(target: LogTarget, options: Partial<ReadOptions> = {}): AsyncGenerator<Observation> {
    return observe(target, this.#reading(options));
  }

  /** A log as it stands, as one page, and what it folds to. */
  async history(target: LogTarget, options: Partial<ReadOptions> = {}): Promise<Page> {
    return history(target, this.#reading(options));
  }

  // ── what the agents send through ────────────────────────────────────────────

  /** One command frame up the socket, checked against its schema before it leaves. */
  send<K extends CommandType>(type: K, agent: string, call: string | null, data: Camel<CommandData<K>>, id: string): void {
    this.#connection.send(frame(type, agent, call, data, id));
  }

  /** One event an agent has finished with, for the listeners registered across every agent. */
  seen(event: CamelEvent, call: Call | null): void {
    this.#listeners.emit(event, call);
  }

  /** Something failed where nobody was waiting. */
  onError(error: Error): void {
    if (this.#errors.size === 0) {
      console.error(error);
      return;
    }
    for (const listener of this.#errors) {
      listener(error);
    }
  }

  #take(entry: Entry): void {
    if (entry.type === "error" && entry.agent === "") {
      const said = eventOf(entry);
      if (said.type === "error" && said.data.code === STOPPED) return this.#stopped(said.data.message);
    }
    const agent = this.#agents.get(entry.agent);
    if (agent === undefined) {
      // An entry for an agent this client never declared: the socket is shared, the app is not.
      return;
    }
    try {
      agent.take(entry);
    } catch (failed) {
      this.onError(asError(failed));
    }
  }

  // Nobody listening is nobody who would ever learn why the app went quiet: it is said on the error door.
  #stopped(why: string): void {
    this.#connection.close();
    if (this.#stops.size === 0) {
      this.onError(new PinecallError(why));
      return;
    }
    for (const listener of this.#stops) {
      try {
        listener(why);
      } catch (failed) {
        this.onError(asError(failed));
      }
    }
  }

  async #declareAll(): Promise<void> {
    for (const agent of this.#agents.values()) {
      await agent.open();
    }
    for (const listener of this.#connects) {
      try {
        listener();
      } catch (failed) {
        this.onError(asError(failed));
      }
    }
  }

  #pingAll(): void {
    for (const agent of this.#agents.values()) {
      try {
        agent.ping();
      } catch (failed) {
        this.onError(asError(failed));
      }
    }
  }

  #reading(options: Partial<ReadOptions>): ReadOptions {
    return { url: this.url, apiKey: this.apiKey, ...(this.env === undefined ? {} : { env: this.env }), ...options };
  }
}
