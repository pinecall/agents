// One subscription per call, however many hooks read it: opened by the first, closed by the last.

import { initialState } from "@pinecall/protocol";
import type { Room } from "livekit-client";

import { Fold } from "./fold.js";
import { overGateway, type GatewayCall } from "./gateway-source.js";
import { inRoom } from "./room-source.js";
import type { CallSource, PublicState } from "./source.js";

/** Which call, and from where: the room the widget sits in, the gateway outside it, or a source of one's own. */
export type CallInput = { room: Room } | GatewayCall | CallSource;

/** What every reader sees before its call has said anything. Never folded into: the fold starts its own. */
const NOTHING_YET: PublicState = initialState();

class Subscription {
  readonly fold: Fold;
  readonly listeners = new Set<() => void>();
  readonly #stop: () => void;
  #closed = false;

  constructor(source: CallSource) {
    this.fold = new Fold(
      (after) => source.replay(after),
      (why) => console.warn(`@pinecall/web: ${why}`),
    );
    this.#stop = source.open({
      onSnapshot: (snapshot) => this.#moved(() => this.fold.snapshot(snapshot)),
      onEntry: (entry) => this.#moved(() => this.fold.entry(entry)),
      onClosed: () => this.close(),
      onRefused: (why) => console.warn(`@pinecall/web: ${why}`),
    });
  }

  /** Let go of the wire. The state stays for whoever is still reading it. */
  close(): void {
    if (!this.#closed) {
      this.#closed = true;
      this.#stop();
    }
  }

  #moved(fold: () => void): void {
    const before = this.fold.state;
    fold();
    if (this.fold.ended) {
      this.close();
    }
    if (this.fold.state !== before) {
      for (const listener of this.listeners) {
        listener();
      }
    }
  }
}

// Keyed by what names the call on each input: the room object, the call id, or the source
// itself. Emptied as the last listener leaves, so nothing here outlives a call.
const open = new Map<object | string, Subscription>();

/** The call's state as this page knows it right now. Empty until somebody listens and the wire speaks. */
export function stateOf(input: CallInput): PublicState {
  return open.get(keyOf(input))?.fold.state ?? NOTHING_YET;
}

/** Hear every move of one call. The first listener opens the wire; the last one's leave closes it. */
export function listen(input: CallInput, listener: () => void): () => void {
  const key = keyOf(input);
  const subscription = open.get(key) ?? new Subscription(sourceOf(input));
  open.set(key, subscription);
  subscription.listeners.add(listener);
  return () => {
    subscription.listeners.delete(listener);
    if (subscription.listeners.size === 0) {
      subscription.close();
      open.delete(key);
    }
  };
}

/** What names the call in an input, stable across renders: never a fresh object literal. */
export function keyOf(input: CallInput): object | string {
  if ("room" in input) {
    return input.room;
  }
  if ("url" in input) {
    return input.call;
  }
  return input;
}

function sourceOf(input: CallInput): CallSource {
  if ("room" in input) {
    return inRoom(input.room);
  }
  if ("url" in input) {
    return overGateway(input);
  }
  return input;
}
