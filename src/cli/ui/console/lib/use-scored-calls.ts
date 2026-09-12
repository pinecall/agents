/** One agent's finished calls with the verdict each was sealed with: the agent's list, scored. */

import { useAgentSessions } from "./use-agent-sessions";
import { useScores, type Scored } from "./use-scores";

export type { Scored } from "./use-scores";

/** The agent's scored calls, newest first, and whatever the sessions door refused with. */
export interface ScoredCalls {
  rows: Scored[];
  error: string | null;
}

/** Follow one agent's finished calls, each with the `call.score` its log seals on. */
export function useScoredCalls(agent: string): ScoredCalls {
  const { lines, error } = useAgentSessions(agent);
  return { rows: useScores(lines), error };
}
