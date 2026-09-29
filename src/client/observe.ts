// Log reading: one URL served as a JSON page or SSE, folded by the protocol's reducer.

import { decodeEntry, eventOf } from "../wire/codec.js";
import { type Entry } from "../wire/envelope.js";
import { apply, initialState } from "../wire/reduce.js";
import { type State } from "../wire/state.js";
import { agentLogUrl, callLogUrl } from "./endpoints.js";
import { PinecallError } from "./frames.js";
import { camelEvent, type CamelEvent } from "./listeners.js";
import { signed, type World } from "./signed.js";

/** A call's log or an agent's own log. */
export type LogTarget = { call: string; agent?: never } | { agent: string; call?: never };

/** Connection and cursor options for reading a log. */
export interface ReadOptions {
  url: string;
  apiKey: string;
  /** The world to read from; omitted means sandbox. */
  env?: World;
  after?: number;
  signal?: AbortSignal;
}

/** One page of a log: entries after the cursor, their folded state, and the next cursor. */
export interface Page {
  entries: Entry[];
  state: State;
  /** True while the log is still open and more entries will follow. */
  live: boolean;
  /** The cursor for the next page, or null when nothing follows. */
  next: number | null;
}

/** One entry, its decoded event, and the folded state including it. */
export interface Observation {
  entry: Entry;
  event: CamelEvent;
  state: State;
}

const RETRY_MS = 1_000;
const RETRY_CAP_MS = 30_000;

/**
 * Stream a log from the cursor onward, until aborted.
 *
 * A dropped stream reconnects with `Last-Event-ID`; a reader that fell behind receives `log.gap`
 * (with a snapshot when available) and then `log.caught_up`. Throws only if the first connection
 * fails.
 */
export async function* observe(target: LogTarget, options: ReadOptions): AsyncGenerator<Observation> {
  let state = initialState();
  let after = options.after ?? 0;
  let attempt = 0;
  let opened = false;
  while (!aborted(options.signal)) {
    try {
      for await (const entry of stream(target, { ...options, after })) {
        attempt = 0;
        opened = true;
        after = entry.seq;
        state = apply(state, entry);
        yield { entry, event: camelEvent(eventOf(entry)), state };
      }
    } catch (failed) {
      if (aborted(options.signal)) {
        return;
      }
      // Never opened means misconfiguration (bad key, unknown call): surface it. Later drops retry.
      if (!opened) {
        throw failed;
      }
    }
    attempt += 1;
    await pause(Math.min(RETRY_CAP_MS, RETRY_MS * 2 ** (attempt - 1)) * Math.random(), options.signal);
  }
}

/**
 * Read one page of a log after the cursor. Use `next` rather than the last entry's seq: an empty
 * page of a live log still has one.
 */
export async function history(target: LogTarget, options: ReadOptions): Promise<Page> {
  const response = await read(target, options, "application/json");
  const page: unknown = await response.json();
  if (page === null || typeof page !== "object" || !Array.isArray((page as { entries?: unknown }).entries)) {
    throw new PinecallError("the log page is not { entries, live, next }");
  }
  const { entries: raw, live, next } = page as { entries: unknown[]; live?: unknown; next?: unknown };
  const entries = raw.map((one: unknown) => decodeEntry(one));
  return {
    entries,
    state: entries.reduce(apply, initialState()),
    live: live === true,
    next: typeof next === "number" ? next : null,
  };
}

/** One SSE connection, yielding entries until it closes or is aborted. */
async function* stream(target: LogTarget, options: ReadOptions): AsyncGenerator<Entry> {
  const response = await read(target, options, "text/event-stream");
  if (response.body === null) {
    throw new PinecallError("the event stream came back with no body");
  }
  let buffered = "";
  const decoder = new TextDecoder();
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    buffered += decoder.decode(chunk, { stream: true });
    let cut = buffered.indexOf("\n\n");
    while (cut !== -1) {
      const entry = entryIn(buffered.slice(0, cut));
      buffered = buffered.slice(cut + 2);
      cut = buffered.indexOf("\n\n");
      if (entry !== null) {
        yield entry;
      }
    }
  }
}

/** Parse one SSE block, or null for a comment or keep-alive. */
function entryIn(block: string): Entry | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  return data === "" ? null : decodeEntry(JSON.parse(data) as unknown);
}

async function read(target: LogTarget, options: ReadOptions, accept: string): Promise<Response> {
  const url = new URL(target.call === undefined ? agentLogUrl(options.url, target.agent) : callLogUrl(options.url, target.call));
  const after = options.after ?? 0;
  if (after > 0) {
    url.searchParams.set("after", String(after));
  }
  const headers: Record<string, string> = { accept, ...signed(options.apiKey, options.env) };
  if (after > 0) {
    headers["last-event-id"] = String(after);
  }
  const response = await fetch(url, { headers, ...(options.signal === undefined ? {} : { signal: options.signal }) });
  if (!response.ok) {
    throw new PinecallError(`${url.pathname}: the gateway answered ${response.status}`);
  }
  return response;
}

// A function so TypeScript doesn't narrow `signal.aborted` across the loop.
function aborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

async function pause(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
