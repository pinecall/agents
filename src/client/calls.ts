// One live call, as the app holds it: what is known about the line, and every command it can send.

import type { Camel, Channel, CommandData, CommandType, Contact, EventType, ToolResult, ToolSpec } from "@pinecall/protocol";
import type { AnyListener, CamelEvent, Listener } from "./listeners.js";
import { Listeners } from "./listeners.js";

/** What a call sends its commands through: the agent that owns it. */
export interface CallGateway {
  readonly slug: string;
  command<K extends CommandType>(type: K, call: string | null, data: Camel<CommandData<K>>): void;
  onError(error: Error): void;
}

/** Where the call is in its life, as the log has said so far. */
export type CallStatus = "ringing" | "dialing" | "active" | "ended";

/**
 * A call the app is serving.
 *
 * Everything on it was read off the log — the SDK never invents a field the wire does not carry —
 * and every method is one command, sent and not awaited: the gateway answers with the events the
 * command lands as, and those arrive as entries like everything else.
 */
export class Call {
  status: CallStatus = "ringing";
  channel: Channel | null = null;
  from: string | null = null;
  to: string | null = null;
  contact: Camel<Contact> | null = null;
  /** The eval run that opened this call, or null for a person: a run's call starts mid-conversation. */
  run: string | null = null;
  /** The app's state as this client last set it, and as `state.changed` last reported it. */
  state: Record<string, unknown> = {};
  /**
   * The day the call opened, `YYYY-MM-DD` in this process's timezone: what a prompt means by today.
   * Learned again from `call.attached`: the day the call opened, not the day it changed hands.
   */
  today: string;

  readonly #listeners: Listeners<Call>;

  constructor(
    readonly id: string,
    private readonly gateway: CallGateway,
    openedAt: number,
  ) {
    this.today = dayOf(openedAt);
    this.#listeners = new Listeners<Call>((error) => gateway.onError(error));
  }

  /** The agent serving this call. */
  get agent(): string {
    return this.gateway.slug;
  }

  /** Listen for one event type on this call alone. The returned function stops listening. */
  on<K extends EventType>(type: K, listener: Listener<K, Call>): () => void {
    return this.#listeners.on(type, listener);
  }

  /** Listen for every event on this call. The returned function stops listening. */
  onAny(listener: AnyListener<Call>): () => void {
    return this.#listeners.onAny(listener);
  }

  // ── the commands ────────────────────────────────────────────────────────────

  /** Say this, verbatim, now. Lands as `turn.agent`. */
  say(text: string, options: { allowInterruptions?: boolean } = {}): void {
    this.gateway.command("agent.say", this.id, { text, ...options });
  }

  /** Make the model speak now, guided by an instruction the caller never hears. Lands as `turn.agent`. */
  reply(instructions: string, options: { allowInterruptions?: boolean } = {}): void {
    this.gateway.command("agent.reply", this.id, { instructions, ...options });
  }

  /** Rewrite one block of the prompt, whole, by name: one of the framework's four, or one the agent declared. */
  setPrompt(name: string, text: string): void {
    this.gateway.command("prompt.set", this.id, { name, text });
  }

  /** The tools the model may see now: the subset of the declaration this state allows. */
  setTools(tools: Camel<ToolSpec>[]): void {
    this.gateway.command("tools.set", this.id, { tools });
  }

  /** The app's state changed and this is all of it. Lands as `state.changed`. */
  setState(state: Record<string, unknown>, changed?: string[]): void {
    this.state = { ...state };
    this.gateway.command("state.set", this.id, changed === undefined ? { state } : { state, changed });
  }

  /** What came back from running a tool in this process, against the `call_id` the model gave. */
  toolResult(result: Camel<ToolResult>): void {
    this.gateway.command("tool.result", this.id, result);
  }

  /** A fact from the tenant's backend. The agent must have declared the name, or this is refused. */
  event(name: string, data: Record<string, unknown>): void {
    this.gateway.command("call.event", this.id, { name, data });
  }

  /** End the call from the app's side. `call.ended` follows with reason agent_hung_up. */
  hangup(reason?: string): void {
    this.gateway.command("call.hangup", this.id, reason === undefined ? {} : { reason });
  }

  /** Write a line of the app's own into the call's log. Lands as `custom`, with a seq like anything. */
  log(name: string, data: Record<string, unknown> = {}): void {
    this.gateway.command("call.log", this.id, { name, data });
  }

  // ── what the log teaches it ─────────────────────────────────────────────────

  /** Fold one event into what the call knows, then hand it to this call's listeners. */
  take(event: CamelEvent): void {
    this.#learn(event);
    this.#listeners.emit(event, this);
  }

  #learn(event: CamelEvent): void {
    switch (event.type) {
      case "call.ringing":
        this.status = "ringing";
        this.#line(event.data);
        return;
      case "call.dialing":
        this.status = "dialing";
        this.#line(event.data);
        return;
      case "call.started":
        this.status = "active";
        this.#line(event.data);
        return;
      case "call.ended":
        this.status = "ended";
        return;
      // A call handed to this process mid-conversation: how it started, and where its state stands.
      case "call.attached":
        this.status = "active";
        this.#line(event.data.started);
        this.state = { ...event.data.state };
        this.today = dayOf(event.data.started.startedAt);
        return;
      case "state.changed":
        this.state = { ...event.data.state };
        return;
      default:
        return;
    }
  }

  #line(line: {
    channel: Channel;
    from: string;
    to: string;
    caller: Camel<Contact> | null;
    run?: string | null | undefined;
  }): void {
    this.channel = line.channel;
    this.from = line.from;
    this.to = line.to;
    this.contact = line.caller;
    this.run = line.run ?? null;
  }
}

/** Every call this agent is serving right now, by id. A call is forgotten when its log ends. */
export class CallBook {
  readonly #live = new Map<string, Call>();

  constructor(private readonly gateway: CallGateway) {}

  /** The calls in progress, in the order they opened. */
  get live(): Call[] {
    return [...this.#live.values()];
  }

  /** The call this entry belongs to, opened on the first entry that named it. */
  of(id: string, at: number): Call {
    const known = this.#live.get(id);
    if (known !== undefined) {
      return known;
    }
    const call = new Call(id, this.gateway, at);
    this.#live.set(id, call);
    return call;
  }

  /** Forget a call whose log has ended. Listeners for `call.ended` have already run. */
  forget(call: Call): void {
    if (call.status === "ended") {
      this.#live.delete(call.id);
    }
  }
}

/** The day of a unix timestamp, `YYYY-MM-DD`, in this process's timezone. */
function dayOf(ts: number): string {
  const at = new Date(ts * 1000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
