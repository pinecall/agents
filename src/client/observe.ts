// Reading a log: the same URL as a JSON page and as SSE, folded by the protocol's own reducer.

import { apply, decodeEntry, eventOf, initialState, type Entry, type State } from "@pinecall/protocol";
import { agentLogUrl, callLogUrl } from "./endpoints.js";
import { PinecallError } from "./frames.js";
import { camelEvent, type CamelEvent } from "./listeners.js";

/** Whose log: one call's, or an agent's own. */
export type LogTarget = { call: string; agent?: never } | { agent: string; call?: never };

/** Where to read from and from which cursor. */
export interface ReadOptions {
  url: string;
  apiKey: string;
  after?: number;
  signal?: AbortSignal;
}

/** One page of a log: the entries after the cursor, what they fold to, and where to go next. */
export interface Page {
  entries: Entry[];
  state: State;
  /** True while the log is still open: more will follow, and the stream is how to get it. */
  live: boolean;
  /** The cursor to ask from next, or null when nothing follows this page. */
  next: number | null;
}

/** One entry, what it means, and the state the log has folded to including it. */
export interface Observation {
  entry: Entry;
  event: CamelEvent;
  state: State;
}

const RETRY_MS = 1_000;
const RETRY_CAP_MS = 30_000;

/**
 * A log as it happens: every entry after the cursor, then everything that follows, forever.
 *
 * The cursor is the whole protocol. A stream that drops is the same URL again with a fresher
 * `Last-Event-ID`, and the platform answers a reader that fell behind with `log.gap` — carrying a
 * snapshot when it has one — then `log.caught_up` when what follows is live. The reducer is
 * `@pinecall/protocol`'s, so a client and the platform never disagree about what a log means.
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
      // A stream that never opened is a misconfiguration — a wrong key, a call nobody has — and
      // the reader hears it now. One that dropped after it worked is what the cursor is for.
      if (!opened) {
        throw failed;
      }
    }
    attempt += 1;
    await pause(Math.min(RETRY_CAP_MS, RETRY_MS * 2 ** (attempt - 1)) * Math.random(), options.signal);
  }
}

// The page says where to go next itself, rather than leaving the reader to infer a cursor from
// the last entry it happened to receive: an empty page of a live log still has a next.
/** The log as it stands: one page after the cursor, what it folds to, and whether more follows. */
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

/** One SSE connection: entries until the server closes it or the reader is aborted. */
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

/** One SSE block as an entry, or null for a comment or a keep-alive that carries no data. */
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
  const headers: Record<string, string> = { accept, authorization: `Bearer ${options.apiKey}` };
  if (after > 0) {
    headers["last-event-id"] = String(after);
  }
  const response = await fetch(url, { headers, ...(options.signal === undefined ? {} : { signal: options.signal }) });
  if (!response.ok) {
    throw new PinecallError(`${url.pathname}: the gateway answered ${response.status}`);
  }
  return response;
}

/** True once the reader asked to stop. A function, so no narrowing survives the loop's own check. */
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
