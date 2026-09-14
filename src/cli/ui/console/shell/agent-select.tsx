/** The agent selector: which of the org's agents the screen is about, carried to the same screen of another. */

import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";

import { bySlug, meIn } from "../lib/corners";
import { useHeldAgents } from "../lib/use-held-agents";
import { useWhoami } from "../lib/whoami";

// The screens under an agent that make sense for every agent. A call or a session in the path is
// one agent's alone, so the selector lands on the screen and drops the id.
const FLEET_SCREENS = new Set(["talk", "chat", "calls", "sessions", "pipeline", "knowledge", "memory", "evals"]);

/** One `<select>` of the agents the gateway holds. Choosing one is a navigation, never a state. */
export function AgentSelect({ agent }: { agent: string }): ReactNode {
  // One row per slug, because the choice IS the slug: every screen under an agent is
  // `/a/<slug>/…` and the door behind it answers in the corner this key opens. A key that
  // sees the whole team gets several rows for one slug, and offering them all would offer
  // pages that show the reader their own copy anyway.
  const agents = bySlug(useHeldAgents().agents, meIn(useWhoami()));
  const navigate = useNavigate();
  const segments = useLocation().pathname.split("/").filter(Boolean);
  const screen = agent === "" ? "talk" : (segments[2] ?? "talk");
  const kept = FLEET_SCREENS.has(screen) ? screen : "talk";
  if (agents.length === 0 && agent === "") return null;

  return (
    <label className="agent-select fixed">
      <span className="agent-select-label">agent</span>
      <select
        className="agent-select-control fixed"
        value={agents.some((held) => held.slug === agent) ? agent : ""}
        onChange={(event) => {
          if (event.target.value !== "") void navigate(`/a/${event.target.value}/${kept}`);
        }}
        aria-label="which agent"
      >
        <option value="">{agent === "" ? "—" : agent}</option>
        {agents.map((held) => (
          <option key={held.slug} value={held.slug}>
            {held.slug}
          </option>
        ))}
      </select>
    </label>
  );
}
