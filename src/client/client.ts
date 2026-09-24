// The client: one socket, the agents on it, and a door to any log the key can read.

import { createRequire } from "node:module";
import { hostname } from "node:os";
import { eventOf, type Camel, type CommandData, type CommandType, type Entry, type EventType } from "@pinecall/protocol";
import { Agent, type AgentGateway, type AgentOptions } from "./agent.js";
import type { Call } from "./calls.js";
import { Connection, type Backoff, type ConnectionOptions } from "./connection.js";
import { lookupUrl } from "./endpoints.js";
import { PinecallError, frame } from "./frames.js";
import { Listeners, asError, type AnyListener, type CamelEvent, type Listener } from "./listeners.js";
import { history, observe, type LogTarget, type Observation, type Page, type ReadOptions } from "./observe.js";
import { signed, type World } from "./signed.js";

// Two levels up from dist/client/, and from src/client/ under a loader: the package's own manifest.
const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

// The code of the `error` a member of the org sends by stopping this app (`POST /v1/apps/{app}/stop`):
// the socket closes right after it, and the app stays closed — one that dialled back would stop nothing.
const STOPPED = "stopped";

/** One chunk a search found, as the model reads it: where it came from, and its text. */
export interface Found {
  path: string;
  heading: string | null;
  text: string;
}

/** How long a drain waits: for the gateway to answer each agent's drain, and for the tools running. */
export interface DrainOptions {
  answerMs?: number;
  toolsMs?: number;
}

/** What a drain did: calls handed to another process, calls kept for the next, tools let finish. */
export interface Drained {
  handed: number;
  parked: number;
  tools: number;
  finished: number;
}

// A deploy's grace is the process manager's, and this is most of it: a tool slower than this is cut
// as a slow app's would be, and the model reads the tool's own timeout instead of its answer.
const DEFAULT_TOOLS_MS = 30_000;

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

  /**
   * Leave without cutting a call: every agent drains — the gateway moves its live calls to another
   * process holding it, or keeps them for the next one that registers — and the tools running now
   * are let finish, up to `toolsMs`. It does not close: `close()` after it does. A socket that is
   * already down has nothing to drain, because the gateway moved its calls when it saw it go.
   */
  async drain({ answerMs, toolsMs = DEFAULT_TOOLS_MS }: DrainOptions = {}): Promise<Drained> {
    this.#connection.leaving();
    const agents = [...this.#agents.values()];
    const done: Drained = { handed: 0, parked: 0, tools: 0, finished: 0 };
    if (!this.connected) return done;
    const answers = await Promise.allSettled(agents.map((agent) => agent.drain(answerMs)));
    for (const answer of answers) {
      if (answer.status === "fulfilled") {
        done.handed += answer.value.handed;
        done.parked += answer.value.parked;
      } else {
        this.onError(asError(answer.reason));
      }
    }
    done.tools = agents.reduce((sum, agent) => sum + agent.inFlight, 0);
    let timer: NodeJS.Timeout | undefined;
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, toolsMs);
    });
    await Promise.race([Promise.all(agents.map((agent) => agent.settled())), cap]);
    clearTimeout(timer);
    done.finished = done.tools - agents.reduce((sum, agent) => sum + agent.inFlight, 0);
    return done;
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

  /**
   * One search of the bases the agent reads, for a call this client is serving: the gateway runs
   * it — the base is its, and so is the log line saying what was found — and the chunks come back
   * as the model would read them. `k` is how many; the base's own when not said.
   */
  async search(call: string, query: string, k?: number): Promise<Found[]> {
    const answered = await fetch(lookupUrl(this.url, call), {
      method: "POST",
      headers: { ...signed(this.apiKey, this.env), "content-type": "application/json" },
      body: JSON.stringify({ tool: "search", input: k === undefined ? { query } : { query, k } }),
    });
    const text = await answered.text();
    // The gateway's own sentence: which call is not open here, which base the org may not keep.
    if (!answered.ok) throw new PinecallError(`search: the gateway answered ${answered.status}: ${detailOf(text)}`);
    return (JSON.parse(text) as { output: { chunks: Found[] } }).output.chunks;
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

/** The `detail` a refused door answers with, or the body as it came when it is not that shape. */
function detailOf(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    return typeof parsed.detail === "string" ? parsed.detail : text;
  } catch {
    return text;
  }
}
