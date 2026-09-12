/** The org's floor: every agent's calls in one list, and the stream that says when it changed. */

import { SessionListSchema, type SessionLine } from "@pinecall/protocol";
import { useEffect, useState } from "react";

import { doorUrl, read } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";
import { openLog } from "./stream";
import type { Connection } from "./stream";

// The list is re-asked on a clock, as an agent's is, AND the moment the floor stream says it
// changed: a call ringing anywhere in the org shows up before the next tick.
const EVERY_MS = 3000;

/** The org's calls newest first, how the stream is doing, and what the door refused with. */
export interface Floor {
  lines: SessionLine[];
  connection: Connection;
  /** Grows by one on every agent registered or detached: what the agent list re-reads on. */
  agentsChanged: number;
  error: string | null;
}

/** Follow the org's floor: the sessions door for the rows, `/v1/events` for when to ask again. */
export function useFloor(limit = 50): Floor {
  const credentials = useCredentials();
  const [lines, setLines] = useState<SessionLine[]>([]);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [agentsChanged, setAgentsChanged] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    const ask = async (): Promise<void> => {
      try {
        const listed = SessionListSchema.parse(await read(credentials, "/v1/sessions", { limit }));
        if (!stopped) {
          setLines(listed.calls);
          setError(null);
        }
      } catch (refused) {
        if (!stopped) setError(String(refused));
      }
    };

    void ask();
    const again = window.setInterval(() => void ask(), EVERY_MS);
    // Live only: the feed has no backlog and no seq to resume from, so a frame is a reason to ask
    // the list again, never a row of its own.
    const close = openLog(doorUrl(credentials, "/v1/events"), credentials, {
      onEntry(entry) {
        if (entry.type === "agent.registered" || entry.type === "agent.detached") {
          setAgentsChanged((count) => count + 1);
        }
        void ask();
      },
      onPaint: () => undefined,
      onConnection: setConnection,
      onRefused: setError,
    });
    return () => {
      stopped = true;
      window.clearInterval(again);
      close();
    };
  }, [credentials, limit]);

  return { lines, connection, agentsChanged, error };
}
