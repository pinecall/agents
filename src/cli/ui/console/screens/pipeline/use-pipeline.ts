/** The Pipeline screen's one piece of state: the report the gateway holds, and the turn in flight. */

import { useEffect, useState } from "react";

import { useCredentials } from "../../../shared/credentials";
import { readPipeline, type Report } from "./door";

/** What the screen draws with: the report, and what was refused. */
export interface Pipeline {
  report: Report | null;
  error: string | null;
}

// There is no stream here: a pipeline changes when somebody sets the agent's settings, and the
// door answers the whole report — so the screen never folds one answer into another.
/** Read the agent's pipeline as the next call would be built. */
export function usePipeline(agent: string): Pipeline {
  const credentials = useCredentials();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    setReport(null);
    void readPipeline(credentials, agent).then(
      (read) => {
        if (!stopped) {
          setReport(read);
        }
      },
      (refused: unknown) => {
        if (!stopped) {
          setError(String(refused));
        }
      },
    );
    return () => {
      stopped = true;
    };
  }, [agent, credentials]);

  return { report, error };
}
