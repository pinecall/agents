/** The header strip: the mark and where you are on the left; the agent, the world, whose, and the theme on the right. */

import type { ReactNode } from "react";
import { useLocation } from "react-router";

import { Brand, Crumbs, ThemeToggle } from "../../shared/frame";
import { AgentSelect } from "./agent-select";
import { Leave } from "./leave";
import { OrgSelect } from "./org-select";
import { Whose } from "./whose";
import { WorldToggle } from "./world-toggle";

export function Header({ agent }: { agent: string }): ReactNode {
  const segments = useLocation().pathname.split("/").filter(Boolean);
  // Under an agent the path is /a/<agent>/<screen>; on an org screen it is /<screen> or nothing.
  const crumbs = agent === "" ? ["fleet", ...segments] : ["fleet", agent, ...segments.slice(2)];
  return (
    <>
      <Brand kind="console" />
      <Crumbs crumbs={crumbs} />
      <div className="head-right">
        <AgentSelect agent={agent} />
        <OrgSelect />
        <WorldToggle />
        <Whose />
        <Leave />
        <ThemeToggle />
      </div>
    </>
  );
}
