// The call's log over the gateway's two read doors: `GET /state` once, then `GET /events` as SSE, with the call token.

import { EVENT_SCHEMAS } from "@pinecall/protocol";

import type { CallSource, SourceReader } from "./source.js";
import { publicEntry, publicSnapshot } from "./wire.js";

/** One call, read from outside its room: where the gateway is, which call, and the token the visit was minted. */
export interface GatewayCall {
  url: string;
  call: string;
  token: string;
}

// The log's first entry is written when the worker opens the call, which may be after the page
// mounted: a state door with nothing to say is not a refusal, and the stream carries the call from
// its very first entry.
const NO_LOG_YET = 404;

/** The snapshot, then the tail; a replay is the same door again from a fresher cursor. */
export function overGateway({ url, call, token }: GatewayCall): CallSource {
  let reader: SourceReader | null = null;
  let stream: EventSource | null = null;

  // The token rides the header wherever a header is possible, and the query string where it is
  // not: EventSource cannot set one, and the sink takes `?token=` for exactly that reader.
  const door = (which: "state" | "events", after: number | null): URL => {
    const at = new URL(`${url.replace(/\/$/, "")}/v1/calls/${encodeURIComponent(call)}/${which}`);
    if (after !== null) {
      at.searchParams.set("after", String(after));
      at.searchParams.set("token", token);
    }
    return at;
  };

  const tail = (after: number): void => {
    stream?.close();
    const opened = new EventSource(door("events", after));
    stream = opened;
    // SSE names every frame after the entry's type, and EventSource only delivers the names it was
    // told to listen for: the protocol's registry is the list.
    for (const type of Object.keys(EVENT_SCHEMAS)) {
      opened.addEventListener(type, (frame: MessageEvent<string>) => {
        try {
          reader?.onEntry(publicEntry(JSON.parse(frame.data)));
        } catch (refused) {
          reader?.onRefused(`${type}: ${String(refused)}`);
        }
      });
    }
    // CLOSED is the gateway's 204: the log sealed and nothing follows. A stream that merely dropped
    // is reconnecting on its own, with the browser resending Last-Event-ID.
    opened.onerror = (): void => {
      if (opened.readyState === EventSource.CLOSED && stream === opened) {
        reader?.onClosed();
      }
    };
  };

  const start = async (opened: SourceReader): Promise<void> => {
    const answer = await fetch(door("state", null), { headers: { authorization: `Bearer ${token}` } });
    if (answer.status === NO_LOG_YET) {
      tail(0);
      return;
    }
    if (!answer.ok) {
      opened.onRefused(`GET /v1/calls/${call}/state: the gateway answered ${answer.status}`);
      return;
    }
    const said: unknown = await answer.json();
    const snapshot = publicSnapshot(said);
    opened.onSnapshot(snapshot);
    if ((said as { live?: unknown }).live === false) {
      opened.onClosed();
      return;
    }
    tail(snapshot.last_seq);
  };

  return {
    open(opened) {
      reader = opened;
      start(opened).catch((failed: unknown) => {
        if (reader === opened) {
          opened.onRefused(String(failed));
        }
      });
      return () => {
        reader = null;
        stream?.close();
        stream = null;
      };
    },
    replay(after) {
      if (reader !== null) {
        tail(after);
      }
    },
  };
}
