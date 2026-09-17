/** An agent's calls as the sessions door lists them, and which of them are still going. */

import { LinesSchema, type Line } from "./sessions-wire";
import { useEffect, useState } from "react";

import { read } from "../../shared/api";
import { useCredentials } from "../../shared/credentials";

// A call's own log is a stream; the list of an agent's calls is not — a call that starts writes
// into its own log, and the agent's own log never names it. So this asks the door again on a clock
// slow enough to be free and fast enough that a call that rings shows up while somebody watches.
/** How often the list asks the gateway again: the strip above it says so. */
export const EVERY_MS = 3000;

/** The agent's calls, newest first, and whatever the door refused with. */
export interface AgentSessions {
  lines: Line[];
  error: string | null;
}

/** Follow an agent's calls. The list is the door's answer; nothing here folds a log. */
export function useAgentSessions(slug: string): AgentSessions {
  const credentials = useCredentials();
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    const ask = async (): Promise<void> => {
      try {
        const listed = LinesSchema.parse(
          await read(credentials, `/v1/agents/${slug}/sessions`),
        );
        if (!stopped) {
          setLines(listed.calls);
          setError(null);
        }
      } catch (refused) {
        if (!stopped) {
          setError(String(refused));
        }
      }
    };

    void ask();
    const again = window.setInterval(() => void ask(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(again);
    };
  }, [slug, credentials]);

  return { lines, error };
}

/** A call the platform has not finished with: it is ringing, being dialled, or up. */
export function isLive(line: Line): boolean {
  return line.status !== "ended";
}

/** The live calls first, and the door's own order — newest first — inside each group. */
export function liveFirst(lines: Line[]): Line[] {
  return [...lines.filter(isLive), ...lines.filter((line) => !isLive(line))];
}
