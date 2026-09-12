/** One call as it happens: the folded state for the first paint, then every entry over SSE. */

import {
  apply,
  initialState,
  TERMINAL_EVENT,
  type CustomNote,
  type Entry,
  type State,
} from "@pinecall/protocol";
import { useEffect, useRef, useState } from "react";

import { GatewayError, doorUrl, type Credentials } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { wholeLog } from "./log-pages";
import { openLog, type Connection } from "./stream";

/** What a screen may ask to hear about, entry by entry, without waiting for the next paint. */
export interface CallOptions {
  onEntry?: (entry: Entry) => void;
  onCustom?: (note: CustomNote) => void;
}

/** A call, as far as this reader has been told. The state is the protocol's, folded by it. */
export interface CallLog {
  state: State;
  connection: Connection;
  error: string | null;
}

// The state object is folded in a ref and published as a shallow copy on every paint: the
// protocol's reducer appends to the arrays it already holds, so `state.turns` keeps its identity
// while its contents grow. Memoise on `state.seq`, never on an array.
/** Follow one call. Re-mounting reconnects; the stream's Last-Event-ID is the cursor it resumes on. */
export function useCall(call: string, options: CallOptions = {}): CallLog {
  const credentials = useCredentials();
  const [state, setState] = useState<State>(initialState);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const heard = useRef<CallOptions>(options);

  useEffect(() => {
    heard.current = options;
  });

  useEffect(() => {
    const folded = { current: initialState() };
    let stopped = false;
    let close: (() => void) | null = null;

    const paint = (): void => setState({ ...folded.current });
    const stop = (): void => {
      stopped = true;
      close?.();
    };

    void (async () => {
      let cursor = 0;
      try {
        cursor = await seed(credentials, call, folded, heard);
      } catch (refused) {
        setError(String(refused));
        setConnection("ended");
        return;
      }
      if (stopped) {
        return;
      }
      paint();
      if (folded.current.status === "ended") {
        setConnection("ended");
        return;
      }
      close = openLog(doorUrl(credentials, `/v1/calls/${call}/events`, { after: cursor }), credentials, {
        onEntry(entry) {
          folded.current = apply(folded.current, entry);
          heard.current.onEntry?.(entry);
          told(entry, folded.current, heard.current);
          // Nothing follows the summary, so draw it and hang up rather than reconnect into a 204.
          if (entry.type === TERMINAL_EVENT) {
            paint();
            setConnection("ended");
            stop();
          }
        },
        onPaint: paint,
        onConnection: setConnection,
        onRefused: setError,
      });
      if (stopped) {
        close();
      }
    })();

    return stop;
  }, [call, credentials]);

  return { state, connection, error };
}

// ── the first paint ─────────────────────────────────────────────────────────────

// The whole log so far, folded entry by entry and handed to the screen the same way the stream
// hands what follows: a call that is over has every row on screen, a call in progress has every
// row up to now, and the stream continues from the last seq. A call whose log has not been opened
// yet is a 404, and the honest answer is an empty state and a cursor of zero.
async function seed(
  credentials: Credentials,
  call: string,
  folded: { current: State },
  heard: { current: CallOptions },
): Promise<number> {
  let entries: Entry[];
  try {
    entries = await wholeLog(credentials, call);
  } catch (refused) {
    if (refused instanceof GatewayError && refused.status === 404) {
      return 0;
    }
    throw refused;
  }
  for (const entry of entries) {
    folded.current = apply(folded.current, entry);
    heard.current.onEntry?.(entry);
    told(entry, folded.current, heard.current);
  }
  return entries.at(-1)?.seq ?? 0;
}

// The reducer already kept the note; this hands the screen the one that just landed.
function told(entry: Entry, state: State, options: CallOptions): void {
  if (entry.type !== "custom") {
    return;
  }
  const note = state.custom.at(-1);
  if (note !== undefined) {
    options.onCustom?.(note);
  }
}
