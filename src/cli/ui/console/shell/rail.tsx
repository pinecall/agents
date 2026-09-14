/** The rail: the agent's screens and the gateway's, each drawn only when the key opens it. */

import type { ReactNode } from "react";

import { RailGroup, RailLink } from "../../shared/frame";
import { opens } from "../lib/scopes";
import { bySlug, meIn } from "../lib/corners";
import { useHeldAgents } from "../lib/use-held-agents";
import { useWhoami } from "../lib/whoami";
import { useScopes } from "../lib/whoami";

// Talk first: it is the screen a person opens the console for. The rest read the same log.
const AGENT_SCREENS = [
  { path: "talk", name: "Talk" },
  { path: "chat", name: "Chat" },
  { path: "calls", name: "Calls" },
  { path: "sessions", name: "Sessions" },
  { path: "pipeline", name: "Pipeline" },
  { path: "knowledge", name: "Knowledge" },
  { path: "memory", name: "Memory" },
  { path: "evals", name: "Evals" },
] as const;

// The gateway's layer: what is true across every agent. Agents first, because it is where `/` lands.
const ORG_SCREENS = [
  { path: "", key: "agents", name: "Agents" },
  { path: "live", key: "live", name: "Live" },
  { path: "sessions", key: "sessions", name: "Sessions" },
  { path: "numbers", key: "numbers", name: "Numbers" },
  { path: "keys", key: "keys", name: "Keys" },
  { path: "providers", key: "providers", name: "Providers" },
  { path: "team", key: "team", name: "Team" },
  { path: "usage", key: "usage", name: "Usage" },
] as const;

export function Rail({ agent }: { agent: string }): ReactNode {
  // Until whoami answers, every scope: nothing flickers off and back on when the key turns out
  // to open it. What the key does not open is then not drawn, so no click meets a 403.
  const scopes = useScopes();
  // Agents and not corners: one slug two people are running is one agent against the plan,
  // and a badge reading 2 beside a fleet of one would be a lie a key's reach invented.
  const held = bySlug(useHeldAgents().agents, meIn(useWhoami())).length;
  const open = (screen: string): boolean => scopes === null || opens(scopes, screen);
  // The one count the rail knows without a stream: how many agents the gateway holds right now.
  const hint = (screen: string): string => (screen === "agents" && held > 0 ? String(held) : "");

  return (
    <>
      {agent !== "" && (
        <RailGroup label={agent}>
          {AGENT_SCREENS.filter((screen) => open(screen.path)).map((screen) => (
            <RailLink key={screen.path} to={`/a/${agent}/${screen.path}`} name={screen.name} />
          ))}
        </RailGroup>
      )}
      <RailGroup label="Gateway">
        {ORG_SCREENS.filter((screen) => open(screen.key)).map((screen) => (
          <RailLink
            key={screen.key}
            to={`/${screen.path}`}
            end={screen.path === ""}
            name={screen.name}
            hint={hint(screen.key)}
          />
        ))}
      </RailGroup>
      <div className="rail-foot fixed">
        web · whatsapp · phone
        <br />
        <span className="rail-foot-line">one agent, three doors</span>
      </div>
    </>
  );
}
