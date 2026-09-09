/** One finished call read whole: its durable entries, page by page, oldest first. */

import type { Entry } from "@pinecall/protocol";
import { useEffect, useState } from "react";

import { useCredentials } from "../../lib/credentials";
import { wholeLog } from "../../lib/log-pages";

/** A finished call as this reader has it: every entry, or why it could not be read. */
export interface FinishedCall {
  entries: Entry[];
  reading: boolean;
  error: string | null;
}

// Sessions reads a call that is over, so there is nothing to stream and no cursor to keep: the
// whole log arrives once and the screen draws it. A call still running belongs to Live.
/** Read one finished call. Opening another call reads that one instead. */
export function useFinishedCall(call: string): FinishedCall {
  const credentials = useCredentials();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    setEntries([]);
    setReading(true);
    setError(null);

    void (async () => {
      try {
        const whole = await wholeLog(credentials, call);
        if (!stopped) {
          setEntries(whole);
        }
      } catch (refused) {
        if (!stopped) {
          setError(String(refused));
        }
      } finally {
        if (!stopped) {
          setReading(false);
        }
      }
    })();

    return () => {
      stopped = true;
    };
  }, [call, credentials]);

  return { entries, reading, error };
}
