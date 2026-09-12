/** The Pipeline screen's one piece of state: the report the gateway holds, and the turn in flight. */

import { useCallback, useEffect, useState } from "react";

import { useCredentials } from "../../../shared/credentials";
import { readPipeline, turnKnobs, type Overridden, type Report } from "./door";

/** What the screen draws with: the report, whether a turn is in flight, and what was refused. */
export interface Pipeline {
  report: Report | null;
  saving: boolean;
  error: string | null;
  turn: (knobs: Partial<Overridden>) => Promise<void>;
}

// There is no stream here: a pipeline changes when somebody changes it, and the door answers the
// whole report on both verbs — so the screen never folds one answer into another.
/** Read the agent's pipeline, and hand back the one verb that changes it. */
export function usePipeline(agent: string): Pipeline {
  const credentials = useCredentials();
  const [report, setReport] = useState<Report | null>(null);
  const [saving, setSaving] = useState(false);
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

  const turn = useCallback(
    async (knobs: Partial<Overridden>): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        setReport(await turnKnobs(credentials, agent, knobs));
      } catch (refused) {
        // The gateway's own sentence, verbatim: it is the one that says WHY, and a console that
        // rewrites a refusal is a console that hides the reason.
        setError(refused instanceof Error ? refused.message : String(refused));
      } finally {
        setSaving(false);
      }
    },
    [agent, credentials],
  );

  return { report, saving, error, turn };
}
