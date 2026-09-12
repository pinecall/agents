/** The rail: the agent's screens and the gateway's, each drawn only when the key opens it. */

import type { ReactNode } from "react";
import { NavLink } from "react-router";

import { opens } from "../lib/scopes";
import { useHeldAgents } from "../lib/use-held-agents";
import { useScopes } from "../lib/whoami";
import "./rail.css";

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
  { path: "team", key: "team", name: "Team" },
  { path: "usage", key: "usage", name: "Usage" },
] as const;

export function Rail({ agent }: { agent: string }): ReactNode {
  // Until whoami answers, every scope: nothing flickers off and back on when the key turns out
  // to open it. What the key does not open is then not drawn, so no click meets a 403.
  const scopes = useScopes();
  const held = useHeldAgents().agents.length;
  const open = (screen: string): boolean => scopes === null || opens(scopes, screen);
  const linked = ({ isActive }: { isActive: boolean }): string =>
    isActive ? "rail-link rail-link-here" : "rail-link";
  // The one count the rail knows without a stream: how many agents the gateway holds right now.
  const hint = (screen: string): string => (screen === "agents" && held > 0 ? String(held) : "");

  return (
    <>
      {agent !== "" && (
        <div className="rail-group">
          <p className="rail-label fixed">{agent}</p>
          <div className="rail-links">
            {AGENT_SCREENS.filter((screen) => open(screen.path)).map((screen) => (
              <NavLink key={screen.path} to={`/a/${agent}/${screen.path}`} className={linked}>
                <span>{screen.name}</span>
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <div className="rail-group">
        <p className="rail-label fixed">Gateway</p>
        <div className="rail-links">
          {ORG_SCREENS.filter((screen) => open(screen.key)).map((screen) => (
            <NavLink key={screen.key} to={`/${screen.path}`} end={screen.path === ""} className={linked}>
              <span>{screen.name}</span>
              <span className="rail-hint fixed">{hint(screen.key)}</span>
            </NavLink>
          ))}
        </div>
      </div>
      <div className="rail-foot fixed">
        web · whatsapp · phone
        <br />
        <span className="rail-foot-line">one agent, three doors</span>
      </div>
    </>
  );
}
