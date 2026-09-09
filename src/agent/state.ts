/** The state: what the agent remembers, read as a plain object, diffed, restored and collapsed. */

import { Agent, CONFIG_FIELDS, changes, currentAuthor, internalsOf, isConfigField, withAuthor } from "./agent.js";

// The config names as a type, read off the one list agent.ts declares them in: a name added
// there is dropped from the snapshot here without anybody remembering to write it twice.
type ConfigName = (typeof CONFIG_FIELDS)[number];

// What `snapshot(agent)` returns for a class: its fields and its getters, without the methods and
// without the config. A getter is indistinguishable from a field here, which is the point — the
// state is what a `when` may ask about, and `identified` is as real as `patient`.
type StateOf<T> = {
  [K in keyof T as T[K] extends Function ? never : K extends ConfigName ? never : K]: T[K];
};

/**
 * The agent's state as a plain object — no methods, no config, no framework keys. `Snapshot<T>`
 * is that object for the class T, so `when: (s) => !s.identified` type-checks; bare `Snapshot` is
 * the erased one the framework itself passes around.
 */
export type Snapshot<T = unknown> = unknown extends T ? Record<string, unknown> : StateOf<T>;

/** One field that differs between two snapshots. */
export interface FieldDiff {
  field: string;
  prev: unknown;
  next: unknown;
}

// The state is whatever the app put on the instance: own, enumerable, not a method, not one of the
// config names. Nothing has to be declared twice.
function isStateField(value: unknown, key: string): boolean {
  return !isConfigField(key) && typeof value !== "function";
}

// A getter is state too — `get identified() { return !!this.patient }` is exactly what a `when`
// asks about — so the snapshot reads the prototype chain as well as the instance, stopping at
// Agent so the framework's own accessors never leak into the tenant's state.
function gettersOf(agent: object): string[] {
  const names: string[] = [];
  for (
    let prototype: object | null = Object.getPrototypeOf(agent);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    if ((prototype as { constructor?: unknown }).constructor === Agent) break;
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
      if (typeof descriptor.get === "function" && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Everything the agent remembers right now, copied out so a reader cannot write through it. */
export function snapshot(agent: object): Snapshot {
  const own = internalsOf(agent);
  const readable = agent as Record<string, unknown>;
  const state: Snapshot = {};
  for (const key of Object.keys(own.target)) {
    const value = (own.target as Record<string, unknown>)[key];
    if (isStateField(value, key)) state[key] = value;
  }
  // Read the getters through the agent itself: they are written against `this`, not against target.
  for (const name of gettersOf(agent)) state[name] = readable[name];
  return state;
}

/** What changed between two snapshots, in the order the later one lists its fields. */
export function diff(before: Snapshot, after: Snapshot): FieldDiff[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: FieldDiff[] = [];
  for (const field of fields) {
    if (!Object.is(before[field], after[field])) {
      changed.push({ field, prev: before[field], next: after[field] });
    }
  }
  return changed;
}

/**
 * Put the agent back to a snapshot. This is a write like any other, so it needs an author: the
 * caller's, when one is running, and `restore` when nothing is.
 */
export function restore(agent: object, state: Snapshot): void {
  const author = currentAuthor() ?? "restore";
  const derived = new Set(gettersOf(agent));
  withAuthor(author, () => {
    const writable = agent as Record<string, unknown>;
    const fields = new Set(Object.keys(internalsOf(agent).target));
    for (const key of fields) {
      if (!isConfigField(key) && !(key in state)) writable[key] = undefined;
    }
    // Getters are derived, so a snapshot restores the fields they are derived from and no more.
    for (const [key, value] of Object.entries(state)) {
      if (fields.has(key) || !derived.has(key)) writable[key] = value;
    }
  });
}

/** A collapsed history: one sentence standing in for every change that came before it. */
export interface Collapsed {
  summary: string;
  seq: number;
  at: number;
}

/**
 * Drop the change log and keep one sentence in its place. The state itself is untouched — what
 * collapses is the memory of how it got here, which is what a long call runs out of room for.
 */
export function collapse(agent: object, summary: string): Collapsed {
  const own = internalsOf(agent);
  const collapsed: Collapsed = { summary, seq: ++own.seq, at: Date.now() };
  own.changes.length = 0;
  own.changes.push({
    seq: collapsed.seq,
    field: "@summary",
    prev: undefined,
    next: summary,
    author: "collapse",
    at: collapsed.at,
  });
  return collapsed;
}

/** What the agent last knew about this contact, when a store is wired in. */
export type LastCall = (contact: string) => Promise<Snapshot | null>;

/** The change log, re-exported here because the log and the state are read together. */
export { changes };
