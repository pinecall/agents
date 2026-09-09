// The fold: entries into one public state, in seq order, whatever order the wire delivered them in.

import { apply, initialState, TERMINAL_EVENT, type Entry, type State } from "@pinecall/protocol";

import type { PublicState, Snapshot } from "./source.js";

// The two entries that are about the stream and not about the call. They ride at the seq of the
// last entry they speak for, which is at or past the reader's own, so they are never held.
const CAUGHT_UP = "log.caught_up";
const GAP = "log.gap";

/**
 * One call's state, folded by the protocol's own reducer from what the wire delivers.
 *
 * An entry that follows the state is folded at once. One that skips ahead is held, and the source
 * is asked once for what lies between; the answer ends with `log.caught_up`, which says that
 * whatever is still missing below its seq was never going to come — dropped by the projection, or
 * ephemeral and gone — and the held entries are folded from there. A snapshot replaces everything.
 */
export class Fold {
  #state: State = initialState();
  readonly #held = new Map<number, Entry>();
  #replaying = false;
  #ended = false;

  constructor(
    private readonly replay: (after: number) => void,
    private readonly refused: (why: string) => void,
  ) {}

  /** The state as it stands. A new object every time it moved, so a reader can compare by identity. */
  get state(): PublicState {
    return this.#state;
  }

  /** True once the terminal entry was folded: nothing more is true of the call. */
  get ended(): boolean {
    return this.#ended;
  }

  /** Start over from what the platform says the call is. Older than what is here: ignored. */
  snapshot(snapshot: Snapshot): void {
    if (snapshot.last_seq < this.#state.seq) {
      return;
    }
    this.#state = { ...initialState(), ...snapshot.state, seq: snapshot.last_seq };
    for (const seq of [...this.#held.keys()]) {
      if (seq <= snapshot.last_seq) {
        this.#held.delete(seq);
      }
    }
    this.#drain();
  }

  /** One entry, wherever in the order it landed. */
  entry(entry: Entry): void {
    if (entry.type === CAUGHT_UP || entry.type === GAP) {
      this.#marker(entry);
      return;
    }
    if (entry.seq <= this.#state.seq) {
      return;
    }
    if (entry.seq === this.#state.seq + 1) {
      this.#fold(entry);
      this.#drain();
      return;
    }
    this.#held.set(entry.seq, entry);
    this.#ask();
  }

  // A gap that carries a snapshot is a snapshot. One that carries none dropped only ephemerals,
  // and the reducer records it as such; caught_up folds whatever was held up to its seq first.
  #marker(marker: Entry): void {
    if (marker.seq < this.#state.seq) {
      return;
    }
    const snapshot = marker.data["snapshot"];
    if (marker.type === GAP && typeof snapshot === "object" && snapshot !== null) {
      this.snapshot({ state: snapshot as Snapshot["state"], last_seq: marker.seq });
      return;
    }
    for (const seq of [...this.#held.keys()].sort((a, b) => a - b)) {
      if (seq <= marker.seq) {
        this.#fold(this.#held.get(seq) as Entry);
        this.#held.delete(seq);
      }
    }
    this.#fold(marker);
    this.#replaying = false;
    this.#drain();
  }

  // The reducer appends to the arrays it is given, so it is given a copy: every state this fold
  // ever handed out stays as it was, and a selector compares by value against a snapshot it kept.
  #fold(entry: Entry): void {
    try {
      this.#state = apply(structuredClone(this.#state), entry);
    } catch (refused) {
      this.refused(`seq ${entry.seq} ${entry.type}: ${String(refused)}`);
      this.#state = { ...this.#state, seq: entry.seq };
    }
    this.#ended ||= entry.type === TERMINAL_EVENT;
  }

  #drain(): void {
    let next = this.#held.get(this.#state.seq + 1);
    while (next !== undefined) {
      this.#held.delete(next.seq);
      this.#fold(next);
      next = this.#held.get(this.#state.seq + 1);
    }
    if (this.#held.size > 0) {
      this.#ask();
    }
  }

  #ask(): void {
    if (this.#replaying) {
      return;
    }
    this.#replaying = true;
    this.replay(this.#state.seq);
  }
}
