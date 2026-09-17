/** The top bar: where you are on the left; what this tab is looking at, and the way out, on the right. */

import type { ReactNode } from "react";
import { useLocation } from "react-router";

import { useLeaving } from "../lib/leaving";
import { AGENT_SCREENS, BOX_SCREENS, MODE, ORG_SCREENS } from "../lib/mode";
import { orgOf, useWhoami } from "../lib/whoami";
import { Switcher } from "./switcher";

/** The page's title, from the path: the screen's name, or Session one level under Sessions. */
export function titleOf(pathname: string, agent: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (agent !== "") {
    const screen = AGENT_SCREENS.find((one) => one.path === segments[2]);
    if (screen === undefined) return "Talk";
    return screen.key === "sessions" && segments[3] !== undefined ? "Session" : screen.name;
  }
  if (segments[0] === "cli") return "Sign in a terminal";
  if (segments[0] === "box") {
    const box = BOX_SCREENS.find((one) => one.path === `box/${segments[1] ?? ""}`);
    return box === undefined ? "Box" : box.key === "box-orgs" && segments[2] !== undefined ? "Organization" : box.name;
  }
  const screen = ORG_SCREENS.find((one) => one.path === (segments[0] ?? ""));
  if (screen === undefined) return "Home";
  if (screen.key === "sessions" && segments[1] !== undefined) return "Session";
  return screen.key === "numbers" ? "Phone numbers" : screen.name;
}

export function Top({ agent }: { agent: string }): ReactNode {
  const whose = useWhoami();
  const leave = useLeaving();
  const { pathname } = useLocation();
  // The box's screens are about every org, so the crumb says the box and not the org the key opens.
  const context = agent !== "" ? agent : pathname.startsWith("/box/") ? "box" : whose === null ? "" : orgOf(whose);
  return (
    <header className="top">
      {context !== "" && <span className="top-crumb">{context} /</span>}
      <span className="top-title">{titleOf(pathname, agent)}</span>
      <div className="top-right">
        <Switcher agent={agent} />
        {/* Nothing to sign out of on a machine's own console: it holds no key. */}
        {MODE === "hosted" && (
          <button type="button" className="top-leave" onClick={leave}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
