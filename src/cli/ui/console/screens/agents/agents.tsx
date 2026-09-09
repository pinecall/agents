/** The front page: which agents this fleet is holding, so `/` offers a list and not a URL shape. */

import { AgentListSchema, type HeldAgent } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { read } from "../../lib/api";
import { useCredentials } from "../../lib/credentials";
import { Nothing } from "../../shell/nothing";
import "./agents.css";

export function Agents(): ReactNode {
  const { agents, error } = useHeldAgents();
  return (
    <section className="agents">
      <h1 className="agents-title">agents</h1>
      {error !== null && <Nothing>{error}</Nothing>}
      {error === null && agents.length === 0 && (
        <Nothing>
          No app is holding an agent on this gateway right now.{" "}
          <span className="fixed">pinecall run</span> in the app’s directory registers one.
        </Nothing>
      )}
      {agents.map((held) => (
        <Link className="agents-one" key={held.slug} to={`/a/${held.slug}/talk`}>
          <span>{held.slug}</span>
          <span className="fixed agents-channels">{held.channels.join(" · ")}</span>
        </Link>
      ))}
    </section>
  );
}

/** What the gateway is holding, read once. The list changes when a socket connects, not per paint. */
function useHeldAgents(): { agents: HeldAgent[]; error: string | null } {
  const credentials = useCredentials();
  const [agents, setAgents] = useState<HeldAgent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const held = AgentListSchema.parse(await read(credentials, "/v1/agents"));
        if (!stopped) setAgents(held.agents);
      } catch (refused) {
        if (!stopped) setError(String(refused));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [credentials]);

  return { agents, error };
}
