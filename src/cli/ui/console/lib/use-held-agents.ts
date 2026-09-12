/** Which agents this gateway holds for the key's org, in the key's world, re-read when the floor changes. */

import { AgentListSchema, type HeldAgent } from "@pinecall/protocol";
import { useEffect, useState } from "react";

import { read } from "./api";
import { useCredentials } from "./credentials";

/** The agents the gateway holds, and whatever the door refused with. */
export interface HeldAgents {
  agents: HeldAgent[];
  error: string | null;
}

// Read once, and again when told: the list changes when a socket connects or leaves, which the
// org's stream says (lib/use-floor.ts), not on a clock. `tick` is that telling.
/** What the gateway is holding, as the front page lists it and the selector offers it. */
export function useHeldAgents(tick = 0): HeldAgents {
  const credentials = useCredentials();
  const [agents, setAgents] = useState<HeldAgent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const held = AgentListSchema.parse(await read(credentials, "/v1/agents"));
        if (!stopped) {
          setAgents(held.agents);
          setError(null);
        }
      } catch (refused) {
        if (!stopped) setError(String(refused));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [credentials, tick]);

  return { agents, error };
}
