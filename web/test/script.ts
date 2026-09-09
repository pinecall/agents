// A log a test writes by hand, and a source that plays it: what every test here reads its call from.

import { EPHEMERAL_EVENTS, type Entry, type EventType } from "@pinecall/protocol";

import type { CallSource, Snapshot, SourceReader } from "../src/index.js";

/** One entry as the store would number it, on the call every test here is about. */
export function entry(seq: number, type: EventType, data: Record<string, unknown>): Entry {
  return { seq, ts: seq, call: "call_1", agent: "clinica-norte", type, ephemeral: EPHEMERAL_EVENTS.has(type), data };
}

/** The cart moved: what an agent's `state.changed` says when a public field changes. */
export function cartChanged(seq: number, items: string[]): Entry {
  return entry(seq, "state.changed", { state: { cart: items }, changed: ["cart"] });
}

/** The caller said something: an entry that never touches the cart. */
export function userSaid(seq: number, text: string): Entry {
  return entry(seq, "turn.user", { speech_id: `speech_${seq}`, text, metrics: {} });
}

/**
 * A source a test drives by hand and counts: how often it was opened and closed, and every seq it
 * was asked to replay from. Nothing arrives until the test pushes it.
 */
export class ScriptedSource implements CallSource {
  opened = 0;
  closed = 0;
  readonly replays: number[] = [];
  #reader: SourceReader | null = null;

  open(reader: SourceReader): () => void {
    this.opened += 1;
    this.#reader = reader;
    return () => {
      this.closed += 1;
      this.#reader = null;
    };
  }

  replay(after: number): void {
    this.replays.push(after);
  }

  push(...entries: Entry[]): void {
    for (const one of entries) {
      this.#reader?.onEntry(one);
    }
  }

  greet(snapshot: Snapshot): void {
    this.#reader?.onSnapshot(snapshot);
  }

  end(): void {
    this.#reader?.onClosed();
  }
}
