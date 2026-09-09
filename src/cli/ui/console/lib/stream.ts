/** The EventSource under both log hooks: every entry in seq order, and a paint ten times a second. */

import { decodeEntry, EVENT_SCHEMAS, type Entry } from "@pinecall/protocol";

/** What the console can honestly say about its stream. Nothing here is a guess. */
export type Connection = "connecting" | "live" | "reconnecting" | "ended";

// Ten paints a second. A person watching a conversation cannot read faster than that, and a burst
// of interim transcripts inside one turn would repaint the whole screen dozens of times while
// somebody is trying to read it. `pinecall serve`'s terminal console draws on the same clock.
export const FRAME_MS = 100;


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

/** Open a log's stream. Returns the call that closes it — a hook's effect cleanup, always. */
export function openLog(url: string, reader: LogReader): () => void {
  const source = new EventSource(url);
  let paint: number | null = null;
  let ours = true;

  const schedule = (): void => {
    if (paint !== null) {
      return;
    }
    paint = window.setTimeout(() => {
      paint = null;
      reader.onPaint();
    }, FRAME_MS);
  };

  // The log has an event named `error`, and so does EventSource itself: the connection's own
  // error — the 204 at a call's end, a dropped socket — lands on the same listener, and carries
  // no data. Only a message is an entry; the connection's errors are `onerror`'s below.
  const take = (message: Event): void => {
    if (!(message instanceof MessageEvent)) {
      return;
    }
    try {
      reader.onEntry(decodeEntry(JSON.parse(message.data)));
    } catch (refused) {
      reader.onRefused(String(refused));
      return;
    }
    schedule();
  };

  // SSE names every frame after the entry's own type and EventSource only delivers the names it
  // was told to listen for, so the protocol's registry IS the list of frames a console can be sent.
  for (const type of Object.keys(EVENT_SCHEMAS)) {
    source.addEventListener(type, take);
  }

  source.onopen = (): void => reader.onConnection("live");
  // CLOSED means the gateway will not stream this any more: the 204 it answers once a call is over.
  // A stream that merely dropped is CONNECTING again, with the browser resending Last-Event-ID.
  source.onerror = (): void => {
    if (ours) {
      reader.onConnection(source.readyState === EventSource.CLOSED ? "ended" : "reconnecting");
    }
  };
  reader.onConnection("connecting");

  return () => {
    ours = false;
    if (paint !== null) {
      window.clearTimeout(paint);
    }
    source.close();
  };
}
