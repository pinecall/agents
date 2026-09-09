/** This agent's eval runs, read once and asked for again while one of them is still running. */

import { useEffect, useState } from "react";

import { useCredentials } from "../../lib/credentials";
import { readRuns, type EvalRun } from "./door";

// A run is written when it starts and rewritten as each call opens, so a running one is worth
// asking about again. Nothing streams a run — the runner writes rows, not a log — so the honest
// way to watch one is to ask the door again, on the same clock the calls list is asked on.
const EVERY_MS = 3000;

/** The agent's runs, newest first, and whatever the door refused with. */
export interface EvalRuns {
  runs: EvalRun[];
  reading: boolean;
  error: string | null;
}

/** Follow one agent's eval runs. The list is the door's answer; nothing here folds anything. */
export function useEvalRuns(agent: string): EvalRuns {
  const credentials = useCredentials();
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;

    const ask = async (): Promise<void> => {
      try {
        const listed = await readRuns(credentials, agent);
        if (!stopped) {
          setRuns(listed);
          setError(null);
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
    };

    void ask();
    const again = window.setInterval(() => void ask(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(again);
    };
  }, [agent, credentials]);

  return { runs, reading, error };
}
