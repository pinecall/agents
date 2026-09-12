/** The SSE reader under both log hooks: every entry in seq order, over fetch, and a paint ten times a second. */

import { decodeEntry, type Entry } from "@pinecall/protocol";

import { headersFor, type Credentials } from "../../shared/api";

/** What the console can honestly say about its stream. Nothing here is a guess. */
export type Connection = "connecting" | "live" | "reconnecting" | "ended";

// Ten paints a second. A person watching a conversation cannot read faster than that, and a burst
// of interim transcripts inside one turn would repaint the whole screen dozens of times while
// somebody is trying to read it.
export const FRAME_MS = 100;

// A dropped stream is opened again after this, doubling to the ceiling: a gateway restarting is
// seconds, and a browser hammering it every 100 ms would only make those seconds longer.
const RECONNECT_MS = 500;
const RECONNECT_CEILING_MS = 8_000;

// The gateway answers 204 to a stream of a call that is over: nothing more will ever be said.
const NOTHING_MORE = 204;

/** What a hook wants of its stream: the entries, when to draw, and how the connection is going. */
export interface LogReader {
  /** Every entry, in seq order, the moment it arrives. */
  onEntry: (entry: Entry) => void;
  /** Draw what you have. Called at most once every FRAME_MS, and only after entries arrived. */
  onPaint: () => void;
  onConnection: (connection: Connection) => void;
  /** A frame the protocol does not recognise. The stream goes on; the reader is told. */
  onRefused: (why: string) => void;
}

/** One SSE message, as the wire framed it: the id line, the event line, the data lines joined. */
export interface SseMessage {
  id: string | null;
  event: string | null;
  data: string;
}

// EventSource cannot set a header and the key never rides a URL, so the stream is a fetch whose
// body is read line by line — the same frames, the same `Last-Event-ID` on a reconnect, sent by
// this reader instead of by the browser. The parser is pure and tested on its own.
/** Feed SSE text in chunks; every complete message comes out, in order. */
export class SseParser {
  #buffer = "";
  #id: string | null = null;
  #event: string | null = null;
  #data: string[] = [];

  feed(chunk: string): SseMessage[] {
    this.#buffer += chunk;
    const messages: SseMessage[] = [];
    let at: number;
    while ((at = this.#buffer.search(/\r\n|\n|\r/)) !== -1) {
      const line = this.#buffer.slice(0, at);
      this.#buffer = this.#buffer.slice(at + (this.#buffer.startsWith("\r\n", at) ? 2 : 1));
      const done = this.#line(line);
      if (done !== null) messages.push(done);
    }
    return messages;
  }

  // A blank line ends a message; a line starting with `:` is a comment; otherwise `field: value`.
  #line(line: string): SseMessage | null {
    if (line === "") {
      if (this.#data.length === 0 && this.#event === null && this.#id === null) return null;
      const message: SseMessage = { id: this.#id, event: this.#event, data: this.#data.join("\n") };
      this.#event = null;
      this.#data = [];
      return message;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "id") this.#id = value;
    else if (field === "event") this.#event = value;
    else if (field === "data") this.#data.push(value);
    return null;
  }
}

/** Open a log's stream. Returns the call that closes it — a hook's effect cleanup, always. */
export function openLog(url: string, credentials: Credentials, reader: LogReader): () => void {
  const controller = new AbortController();
  let paint: number | null = null;
  let lastId: string | null = null;
  let backoff = RECONNECT_MS;
  let ours = true;

  const schedule = (): void => {
    if (paint !== null) return;
    paint = window.setTimeout(() => {
      paint = null;
      reader.onPaint();
    }, FRAME_MS);
  };

  const take = (message: SseMessage): void => {
    if (message.id !== null) lastId = message.id;
    if (message.data === "") return;
    try {
      reader.onEntry(decodeEntry(JSON.parse(message.data)));
    } catch (refused) {
      reader.onRefused(String(refused));
      return;
    }
    schedule();
  };

  const connect = async (): Promise<void> => {
    while (ours) {
      let answer: Response;
      try {
        answer = await fetch(url, {
          headers: { ...headersFor(credentials), accept: "text/event-stream", ...(lastId === null ? {} : { "last-event-id": lastId }) },
          signal: controller.signal,
        });
      } catch {
        if (!ours) return;
        reader.onConnection("reconnecting");
        await slept(backoff, controller.signal);
        backoff = Math.min(backoff * 2, RECONNECT_CEILING_MS);
        continue;
      }
      if (answer.status === NOTHING_MORE) {
        reader.onConnection("ended");
        return;
      }
      if (!answer.ok || answer.body === null) {
        reader.onRefused(`the stream answered ${answer.status}`);
        reader.onConnection("ended");
        return;
      }
      reader.onConnection("live");
      backoff = RECONNECT_MS;
      const parser = new SseParser();
      const decoder = new TextDecoder();
      const body = answer.body.getReader();
      try {
        for (;;) {
          const { value, done } = await body.read();
          if (done) break;
          for (const message of parser.feed(decoder.decode(value, { stream: true }))) take(message);
        }
      } catch {
        if (!ours) return;
      }
      if (!ours) return;
      // The body ended without a 204: the gateway went away mid-stream. Resume where we were.
      reader.onConnection("reconnecting");
      await slept(backoff, controller.signal);
      backoff = Math.min(backoff * 2, RECONNECT_CEILING_MS);
    }
  };

  reader.onConnection("connecting");
  void connect();

  return () => {
    ours = false;
    if (paint !== null) window.clearTimeout(paint);
    controller.abort();
  };
}

function slept(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((wake) => {
    const timer = window.setTimeout(wake, ms);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      wake();
    }, { once: true });
  });
}
