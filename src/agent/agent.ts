/** The Agent base class: its fields are the state, and every assignment is a change with an author. */

// tools.ts imports this module back; the cycle is fine because both sides only reach across at
// call time, and both exports are hoisted function declarations.
import type { DocsMode } from "@pinecall/protocol";

import { currentAuthor, UnauthoredWrite } from "./authors.js";
import { docOf, toolsOf, visibleToolsOf, type ToolSpec } from "./tools.js";
import type { Child } from "../views/jsx-runtime.js";
import type { CallWorld } from "../call/call.js";
import type { EventDeclarations, EventMeta } from "./accepts.js";
import { declaredStateOf, type Visibility } from "./visibility.js";
import type { Call, MemoryOp } from "./lifecycle.js";
import { collapse, restore, snapshot, type LastCall, type Snapshot } from "./state.js";

// The eleven names an app uses to configure the agent rather than to remember something about the
// caller. They live on the instance like any other field, but they are never state: they do not
// change during a call, they are not diffed, and no snapshot carries them.
export const CONFIG_FIELDS = [
  "phone",
  "whatsapp",
  "web",
  "voice",
  "says",
  "hears",
  "llm",
  "language",
  "knowledge",
  "docs",
  "memory",
] as const;

// The list is the array; the Set is how this module asks about it on every assignment. state.ts
// derives `ConfigName` from the same array, so a name added here is a name the snapshot drops.
const CONFIG = new Set<string>(CONFIG_FIELDS);

/** One field assignment, as the log and the console read it. */
export interface Change {
  seq: number;
  field: string;
  prev: unknown;
  next: unknown;
  author: string;
  at: number;
}

export type ChangeListener = (change: Change) => void;

/** One named fact the agent put in the call's log. */
export interface LogEntry {
  seq: number;
  name: string;
  data?: unknown;
  at: number;
}

export type LogListener = (entry: LogEntry) => void;

/** One outside fact, as an in-process observer reads it after the hook has had it. */
export interface EventHeard {
  name: string;
  data: Record<string, unknown>;
  meta: EventMeta;
}

export type EventListener = (heard: EventHeard) => void;

/**
 * What `docs` says: the knowledge base the agent answers from, by the name it was pushed under
 * (`pinecall knowledge push --base <name>`), and how its chunks reach the model. The bare string
 * form `docs = "clinica-norte"` is the base alone, with every other setting the runtime's.
 */
export interface DocsDeclaration {
  base: string;
  mode?: DocsMode;
  k?: number;
  minScore?: number;
}

/** What `memory` says: what to keep about a contact across calls, in the tenant's words, and what never to. */
export interface MemoryDeclaration {
  remember?: string[];
  forget?: string[];
}

/** Everything the framework knows about one live agent, kept off the instance's own fields. */
export interface Internals {
  changes: Change[];
  log: LogEntry[];
  logListeners: Set<LogListener>;
  listeners: Set<ChangeListener>;
  eventListeners: Set<EventListener>;
  seq: number;
  sealed: boolean;
  target: object;
  /** The call this instance is serving, set by the bridge at start() and never by the app. */
  call: CallWorld | null;
  /** Where `last(contact)` reads from: `mount({ last })`, per mounted agent and never a global. */
  last: LastCall | null;
  /** What memory has recalled about this caller so far, as `remembers(text)` reads it. Per call. */
  recalled: string[];
}

const internals = new WeakMap<object, Internals>();

/**
 * The base every app agent extends. The constructor hands back a Proxy, so a plain
 * `this.patient = row` inside a tool is the whole state API: one change, one author, one seq.
 */
export class Agent {
  constructor() {
    // Which fields this class said are its state, read once: every `@state` of a class has run by
    // the time one of it exists. null means it decorated none, and then every own field is state.
    const stateFields = declaredStateOf(this.constructor);
    const own: Internals = {
      changes: [],
      log: [],
      logListeners: new Set(),
      listeners: new Set(),
      eventListeners: new Set(),
      seq: 0,
      sealed: false,
      target: this,
      call: null,
      last: null,
      recalled: [],
    };
    const proxy = new Proxy(this, {
      set(target, key, next, receiver) {
        // Config is not state, and neither is a field a class that declares its state left out:
        // that one is the tenant's own scratch space and nothing here records it, sends it or
        // asks it for an author.
        if (typeof key !== "string" || CONFIG.has(key) || (stateFields !== null && !stateFields.has(key))) {
          return Reflect.set(target, key, next, target);
        }
        const prev = Reflect.get(target, key, target) as unknown;
        const ok = Reflect.set(target, key, next, target);
        if (!ok || !own.sealed) return ok;
        const author = currentAuthor();
        // The declaration is written before the agent is sealed, so only a live write can be
        // unauthored — and a live unauthored write is never an accident worth keeping.
        if (author === null) throw new UnauthoredWrite(key);
        if (Object.is(prev, next)) return true;
        const change: Change = { seq: ++own.seq, field: key, prev, next, author, at: Date.now() };
        own.changes.push(change);
        for (const listener of own.listeners) listener(change);
        return true;
      },
    }) as this;
    internals.set(this, own);
    internals.set(proxy, own);
    return proxy;
  }

  /** The class docstring, when the app prefers to say it out loud instead of in a JSDoc. */
  static doc?: string;

  /** The outside facts this class accepts, and from whom: `static events = {...}`. */
  static events?: EventDeclarations;

  /** Who may see a field, for a class that would rather write a map than a `@state`. */
  static visibility?: Record<string, Visibility>;

  /** What this agent is, as the model reads it: the class's own docstring. */
  doc(): string | undefined {
    return docOf(this);
  }

  /**
   * The prompt as a function of the state: what to do about THIS turn, in the class's own words.
   * It is the whole dynamic region and the last thing the model reads. The base renders nothing,
   * so a class that says nothing about the turn sends an empty block.
   */
  render(): Child {
    return null;
  }

  /**
   * Whether memory has already told this call something about the caller under those words — the
   * word a fact was filed under, or the fact itself. The runtime supplies the facts; before it has
   * recalled anything this answers false, which is exactly what a caller nobody has met looks like.
   */
  remembers(text: string): boolean {
    const wanted = text.trim().toLowerCase();
    if (wanted === "") return false;
    return internalsOf(this).recalled.some((known) => known.includes(wanted));
  }

  /** Every tool this agent declares, whether or not the current state shows it. */
  tools(): ToolSpec[] {
    return toolsOf(this).map((declared) => declared.spec);
  }

  /** The tools a model may call right now: the ones whose `when(state)` holds. */
  visibleTools(): ToolSpec[] {
    return visibleToolsOf(this).map((declared) => declared.spec);
  }

  /** Drop the change log and keep one sentence in its place; the state itself stays. */
  collapse(summary: string): void {
    collapse(this, summary);
  }

  /** Put the agent back to a snapshot — the move `onCall` makes when a caller comes back. */
  restore(state: Snapshot): void {
    restore(this, state);
  }

  /**
   * Start the agent in the state a case describes: the fields it names, written over the ones the
   * agent already has — on a fresh instance, the ones the class gave itself. A goldens case names
   * what it is about and nothing else, so `restore` is the wrong door for it: a snapshot is a
   * WHOLE state, and restoring one clears every field it leaves out.
   */
  startIn(state: Snapshot): void {
    restore(this, { ...snapshot(this), ...state });
  }

  /** What this contact left behind last time. Wired per mount: `mount(Class, { pc, last })`. */
  last(contact: string): Promise<Snapshot | null> {
    const source = internalsOf(this).last;
    if (source === null) {
      return Promise.reject(
        new Error("last(contact) needs a store: mount the agent with { last } to give it one"),
      );
    }
    return source(contact);
  }

  /** Put a named fact in the call's log, for the console and for whatever reads it after. */
  log(name: string, data?: unknown): void {
    const own = internalsOf(this);
    const entry: LogEntry = { seq: ++own.seq, name, at: Date.now() };
    if (data !== undefined) entry.data = data;
    own.log.push(entry);
    for (const listener of own.logListeners) listener(entry);
  }

  /**
   * The call being served right now. It is a getter on the base class, not a field, so it never
   * looks like state and never reaches a snapshot; a class that declares its own `call` field is
   * refused at the first write, because there is only one thing that name can mean here.
   */
  get call(): CallWorld {
    const serving = internalsOf(this).call;
    if (serving === null) {
      throw new Error(
        "this.call is only there while a call is being served: the bridge sets it at start(), " +
          "and a test that renders gives one with setCall(agent, new CallWorld(line, () => {}))",
      );
    }
    return serving;
  }

  /** Say this, word for word, now. Resolves true when the turn it lands as arrived. */
  say(text: string, options: { allowInterruptions?: boolean } = {}): Promise<boolean> {
    return this.call.say(text, options);
  }

  /** Make the model speak now, guided by words the caller never hears. Resolves like `say`. */
  reply(instructions: string, options: { allowInterruptions?: boolean } = {}): Promise<boolean> {
    return this.call.reply(instructions, options);
  }

  /** Watch this agent from inside the tenant's own process: every state change, or every event. */
  on(type: "state", listener: ChangeListener): () => void;
  on(type: "event", listener: EventListener): () => void;
  on(type: "state" | "event", listener: ChangeListener | EventListener): () => void {
    if (type === "state") return onChange(this, listener as ChangeListener);
    const own = internalsOf(this);
    own.eventListeners.add(listener as EventListener);
    return () => own.eventListeners.delete(listener as EventListener);
  }

  /** An outside fact the class declared arrived. Override it; writes here are authored by it. */
  onEvent(_name: string, _data: Record<string, unknown>, _meta: EventMeta): unknown {
    return undefined;
  }

  /** A call started. Override it; assigning state here is authored by the hook, not by nobody. */
  onCall(_call: Call): unknown {
    return undefined;
  }

  /** The call ended. Override it to write anything the call is worth writing. */
  onEnd(_call: Call): unknown {
    return undefined;
  }

  /** Memory was written. Override it to send the ops wherever the tenant keeps them. */
  onMemory(_ops: MemoryOp[], _call: Call): unknown {
    return undefined;
  }
}

/** The framework's bookkeeping for one agent, or a clear error if this is not an agent. */
export function internalsOf(agent: object): Internals {
  const own = internals.get(agent);
  if (!own) throw new TypeError("not a Pinecall agent: its constructor never ran through Agent");
  return own;
}

/**
 * Close the declaration and start recording. Everything assigned before this — the field
 * initializers that give the state its shape — is the baseline, not a change.
 */
export function seal<T extends object>(agent: T): T {
  internalsOf(agent).sealed = true;
  return agent;
}

/** Every change this agent has recorded, oldest first. */
export function changes(agent: object): readonly Change[] {
  return internalsOf(agent).changes;
}

/** Hear every field assignment as it happens; the returned function stops listening. */
export function onChange(agent: object, listener: ChangeListener): () => void {
  const own = internalsOf(agent);
  own.listeners.add(listener);
  return () => own.listeners.delete(listener);
}

/** Everything this agent logged, oldest first. */
export function logOf(agent: object): readonly LogEntry[] {
  return internalsOf(agent).log;
}

/** Hear every logged fact as it happens; the returned function stops listening. */
export function onLog(agent: object, listener: LogListener): () => void {
  const own = internalsOf(agent);
  own.logListeners.add(listener);
  return () => own.logListeners.delete(listener);
}

/** Whether a name is one of CONFIG_FIELDS rather than a piece of state. */
export function isConfigField(name: string): boolean {
  return CONFIG.has(name);
}

/** Hand this instance the store its `last(contact)` reads. The bridge does this at start(). */
export function setLast(agent: object, source: LastCall | null): void {
  internalsOf(agent).last = source;
}

/** Hand this instance the call it is serving. The bridge does this once, at start(). */
export function setCall(agent: object, call: CallWorld | null): void {
  internalsOf(agent).call = call;
}

/**
 * Hand this instance what memory has recalled about the caller: every fact, and the word it was
 * filed under. The bridge does this from the call's own `memory.ops` entries, so `remembers(text)`
 * answers with what the runtime actually found and never with a guess.
 */
export function recalled(agent: object, words: readonly string[]): void {
  const own = internalsOf(agent);
  for (const word of words) {
    const known = word.trim().toLowerCase();
    if (known !== "" && !own.recalled.includes(known)) own.recalled.push(known);
  }
}

/** Tell the in-process observers about an event the hook has just been given. */
export function emitEvent(agent: object, heard: EventHeard): void {
  for (const listener of internalsOf(agent).eventListeners) listener(heard);
}
