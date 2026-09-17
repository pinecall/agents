/** One watched call: the folded state the panels read, and the entries the timeline is built from. */

import type { Entry, State } from "@pinecall/protocol";
import { useMemo, useRef } from "react";

import { useCall } from "../../lib/use-call";
import type { Connection } from "../../lib/stream";

/** A call being watched: what it reduces to, what arrived, and how the stream is going. */
export interface WatchedCall {
  state: State;
  entries: Entry[];
  connection: Connection;
  error: string | null;
}

// The timeline needs the log in seq order and the state loses that order on purpose: turns carry no
// seq, so a tool that ran between two replies could not be put back where it happened. So the
// entries are kept as they arrive and published on the hook's own paint, memoised on state.seq —
// which moves on every paint and never on anything else.
/** Follow one call. Every panel of one Live reads this; two Lives never share a thing. */
export function useWatchedCall(call: string): WatchedCall {
  const seen = useRef<Entry[]>([]);
  const log = useCall(call, {
    onEntry(entry) {
      // A remount (StrictMode, a reconnect) reads the log again from its start: an entry already
      // kept is not a second row.
      const last = seen.current.at(-1);
      if (last !== undefined && entry.seq <= last.seq) return;
      seen.current.push(entry);
    },
  });
  const entries = useMemo(() => [...seen.current], [log.state.seq]);
  return { state: log.state, entries, connection: log.connection, error: log.error };
}
