// Who is listening for what. One registry, used for a whole agent and for a single call alike.

import { toCamel, type Camel, type Event, type EventData, type EventType } from "@pinecall/protocol";

/** One event's data as the app reads it: the wire's shape, camelCase. */
export type Payload<K extends EventType> = Camel<EventData<K>>;

/** One event, typed by its type, as the app reads it: switch on `type` and `data` narrows with it. */
export type CamelEvent = { [K in EventType]: { type: K; data: Payload<K> } }[EventType];

/** What runs when an event of one type arrives. */
export type Listener<K extends EventType, Context> = (data: Payload<K>, context: Context) => unknown;

/** What runs for every event, whatever its type. */
export type AnyListener<Context> = (event: CamelEvent, context: Context) => unknown;

type Erased<Context> = (data: never, context: Context) => unknown;

/** The decoded event with its keys as the app reads them. */
export function camelEvent(event: Event): CamelEvent {
  return { type: event.type, data: toCamel(event.data) } as CamelEvent;
}

/**
 * Every listener registered against one thing — an agent, or a call — and the dispatch to them.
 *
 * A listener that throws is a bug in the app, not a reason to stop reading the socket: it is
 * handed to `onError` and the next listener still runs.
 */
export class Listeners<Context> {
  readonly #byType = new Map<string, Set<Erased<Context>>>();
  readonly #any = new Set<AnyListener<Context>>();

  constructor(private readonly onError: (error: Error) => void) {}

  /** Listen for one event type. The returned function stops listening. */
  on<K extends EventType>(type: K, listener: Listener<K, Context>): () => void {
    const listeners = this.#byType.get(type) ?? new Set<Erased<Context>>();
    this.#byType.set(type, listeners);
    listeners.add(listener as Erased<Context>);
    return () => {
      listeners.delete(listener as Erased<Context>);
    };
  }

  /** Listen for every event. The returned function stops listening. */
  onAny(listener: AnyListener<Context>): () => void {
    this.#any.add(listener);
    return () => {
      this.#any.delete(listener);
    };
  }

  /** Hand one event to everybody waiting for it, then to everybody waiting for anything. */
  emit(event: CamelEvent, context: Context): void {
    for (const listener of this.#byType.get(event.type) ?? []) {
      this.#run(() => (listener as (data: unknown, context: Context) => unknown)(event.data, context));
    }
    for (const listener of this.#any) {
      this.#run(() => listener(event, context));
    }
  }

  #run(listener: () => unknown): void {
    try {
      const running = listener();
      if (running instanceof Promise) {
        running.catch((failed: unknown) => this.onError(asError(failed)));
      }
    } catch (failed) {
      this.onError(asError(failed));
    }
  }
}

/** Whatever was thrown, as an Error: `catch` gives `unknown` and a listener may throw a string. */
export function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}
