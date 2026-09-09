// One agent an app speaks for: what it declares, what it does with a tool call, who listens.

import { eventOf, type AgentConfig, type Camel, type CommandData, type CommandType, type Entry, type EventType, type Route, type ToolSpec } from "@pinecall/protocol";
import { Call, CallBook, type CallGateway } from "./calls.js";
import { PinecallError, Refused } from "./frames.js";
import { Listeners, asError, camelEvent, type AnyListener, type CamelEvent, type Listener, type Payload } from "./listeners.js";

/** A door the agent answers. `number` is null for a channel that has none, which is what web is. */
export interface RouteInput {
  channel: Route["channel"];
  number?: string | null;
  label?: string;
}

/** One tool: the contract the model sees, and the function this process runs when it is called. */
export interface Tool extends Camel<ToolSpec> {
  run: (args: Record<string, unknown>, call: Call) => unknown;
}

/** Everything an app declares about an agent, plus the tools' own code. */
export interface AgentOptions extends Omit<Camel<AgentConfig>, "tools"> {
  routes?: RouteInput[];
  tools?: Tool[];
  /**
   * Whether the gateway may hand this socket a call that named no app — every phone call, and every
   * web call that did not ask for one. A console (`pinecall chat`) opens its own call and names
   * this socket, so it passes false and a real caller is never answered here.
   */
  takesUnclaimed?: boolean;
}

/** What an agent sends its frames through: the client that holds the socket. */
export interface AgentGateway {
  send<K extends CommandType>(type: K, agent: string, call: string | null, data: Camel<CommandData<K>>, id: string): void;
  seen(event: CamelEvent, call: Call | null): void;
  onError(error: Error): void;
  readonly sdk: string;
}

const ANSWER_MS = 10_000;

type Waiter = { type: EventType; id: string; settle: (data: unknown) => void; refuse: (error: Error) => void };

/**
 * An agent, from the app's side.
 *
 * The declaration is sent again on every reconnect, because the gateway's registry is memory: it
 * knows which sockets are open right now and nothing else. Many sockets may hold one agent at
 * once and a call nobody claimed takes the newest of those that take unclaimed calls, so a rolling
 * deploy's new process serves from the moment it registers and never waits for the old one to let
 * go — and a console holding the same agent is never handed a call it did not open.
 */
export class Agent implements CallGateway {
  readonly calls: CallBook;
  readonly #listeners: Listeners<Call | null>;
  readonly #tools = new Map<string, Tool>();
  readonly #waiters: Waiter[] = [];
  #routes: RouteInput[];
  #config: Camel<AgentConfig>;
  #takesUnclaimed: boolean;
  #app: string | undefined;

  constructor(
    readonly slug: string,
    options: AgentOptions,
    private readonly gateway: AgentGateway,
  ) {
    const { routes = [], tools = [], takesUnclaimed = true, ...config } = options;
    this.#routes = routes;
    this.#config = config;
    this.#takesUnclaimed = takesUnclaimed;
    this.declare(tools);
    this.calls = new CallBook(this);
    this.#listeners = new Listeners<Call | null>((error) => gateway.onError(error));
  }

  /** What this agent tells the gateway it is, as the wire's own shape. */
  get config(): Camel<AgentConfig> {
    return this.#config;
  }

  /**
   * The socket this app is holding the agent on, as the gateway minted it, or undefined before
   * the first register. A caller that names it — `WS /v1/chat?app=<id>`, an `app` in a worker's
   * `POST /v1/calls` — is served by THIS process, which is what makes `pinecall chat` a console:
   * the tool runs where the person typed the command and not in whichever server registered last.
   */
  get app(): string | undefined {
    return this.#app;
  }

  /** Listen for one event type across every call of this agent. `null` for the agent's own log. */
  on<K extends EventType>(type: K, listener: Listener<K, Call | null>): () => void {
    return this.#listeners.on(type, listener);
  }

  /** Listen for every event of this agent. The returned function stops listening. */
  onAny(listener: AnyListener<Call | null>): () => void {
    return this.#listeners.onAny(listener);
  }

  /** Replace the tools and their code. The next `configure` carries the new declaration. */
  declare(tools: Tool[]): void {
    this.#tools.clear();
    for (const tool of tools) {
      this.#tools.set(tool.name, tool);
    }
    this.#config = { ...this.#config, tools: tools.map(({ run: _run, ...spec }) => spec) };
  }

  /** Change what the agent is. Only the fields sent change; live calls keep their session. */
  async configure(changes: Partial<Camel<AgentConfig>> = {}): Promise<Payload<"agent.configured">> {
    this.#config = { ...this.#config, ...changes };
    return this.#ask("agent.configure", "agent.configured", { config: this.#config });
  }

  /** Claim the slug and its doors, then send the declaration. Run again on every reconnect. */
  async open(): Promise<void> {
    const registered = await this.#ask("agent.register", "agent.registered", {
      routes: this.#routes.map((route) => ({ channel: route.channel, number: route.number ?? null, ...(route.label === undefined ? {} : { label: route.label }) })),
      sdk: this.gateway.sdk,
      takesUnclaimed: this.#takesUnclaimed,
    });
    // A reconnect mints a new socket and so a new id: the one kept is always this socket's own.
    this.#app = registered.app;
    await this.configure();
  }

  // ── the socket's side ───────────────────────────────────────────────────────

  /** One entry of this agent's, folded into the call it belongs to and handed to the listeners. */
  take(entry: Entry): void {
    const event = camelEvent(eventOf(entry));
    const call = entry.call === null ? null : this.calls.of(entry.call, entry.ts);
    this.#settle(event);
    call?.take(event);
    this.#listeners.emit(event, call);
    this.gateway.seen(event, call);
    if (call !== null) {
      this.#onToolCall(event, call);
      this.calls.forget(call);
    }
  }

  /** One command out, on this agent's behalf. */
  command<K extends CommandType>(type: K, call: string | null, data: Camel<CommandData<K>>): void {
    this.gateway.send(type, this.slug, call, data, `${this.slug}:${type}`);
  }

  /** A listener of this agent's threw, where nobody was waiting for the answer. */
  onError(error: Error): void {
    this.gateway.onError(error);
  }

  /** Prove the socket is alive: `ping` is agent-scoped like every command, and lands as `pong`. */
  ping(): void {
    this.command("ping", null, {});
  }

  // ── tools ───────────────────────────────────────────────────────────────────

  // The model called a tool; the code is here, not in the platform. Whatever it answers — a value,
  // a rejection, nothing at all — becomes one tool.result against the model's own call_id, because
  // a turn that never gets one waits forever.
  #onToolCall(event: CamelEvent, call: Call): void {
    if (event.type !== "tool.call") {
      return;
    }
    const { callId, name, arguments: args } = event.data;
    const tool = this.#tools.get(name);
    if (tool === undefined) {
      call.toolResult({ callId, name, error: `this app declares no tool called ${name}` });
      return;
    }
    const started = Date.now();
    void (async () => {
      try {
        const output = await tool.run(args, call);
        call.toolResult({ callId, name, output, durationS: (Date.now() - started) / 1000 });
      } catch (failed) {
        // A rejection is the tool's answer, not an unhandled failure: the model is waiting for it
        // and reads it as `error`, and the log keeps the same tool.result for a person to read
        // afterwards. Printing it as well would report a refusal the app made on purpose twice.
        const error = asError(failed);
        call.toolResult({ callId, name, error: error.message, durationS: (Date.now() - started) / 1000 });
      }
    })();
  }

  // ── waiting for an answer ───────────────────────────────────────────────────

  // A command is answered by the event it lands as, or by an `error` naming the id we sent. Only
  // the two declarations are awaited: everything else on this wire is fire and read the log.
  async #ask<K extends CommandType, E extends EventType>(type: K, lands: E, data: Camel<CommandData<K>>): Promise<Payload<E>> {
    const id = `${this.slug}:${type}`;
    const answer = new Promise<Payload<E>>((resolve, reject) => {
      const waiter: Waiter = { type: lands, id, settle: (payload) => resolve(payload as Payload<E>), refuse: reject };
      this.#waiters.push(waiter);
      setTimeout(() => {
        this.#drop(waiter);
        reject(new PinecallError(`${type}: the gateway did not answer in ${ANSWER_MS}ms`));
      }, ANSWER_MS).unref();
    });
    this.gateway.send(type, this.slug, null, data, id);
    return answer;
  }

  #settle(event: CamelEvent): void {
    for (const waiter of [...this.#waiters]) {
      if (event.type === waiter.type) {
        this.#drop(waiter);
        waiter.settle(event.data);
      } else if (event.type === "error" && event.data.id === waiter.id) {
        this.#drop(waiter);
        waiter.refuse(new Refused(event.data));
      }
    }
  }

  #drop(waiter: Waiter): void {
    const at = this.#waiters.indexOf(waiter);
    if (at !== -1) {
      this.#waiters.splice(at, 1);
    }
  }
}
