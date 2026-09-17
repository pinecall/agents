/** The header strip: the mark and where you are on the left; what this tab is looking at, the way out and the theme on the right. */

import type { ReactNode } from "react";
import { useLocation } from "react-router";

import { Brand, Crumbs, ThemeToggle } from "../../shared/frame";
import { MODE } from "../lib/mode";
import { Leave } from "./leave";
import { Viewing } from "./viewing";

export function Header({ agent }: { agent: string }): ReactNode {
  const segments = useLocation().pathname.split("/").filter(Boolean);
  // Under an agent the path is /a/<agent>/<screen>; on an org screen it is /<screen> or nothing.
  const crumbs = agent === "" ? ["fleet", ...segments] : ["fleet", agent, ...segments.slice(2)];
  return (
    <>
      <Brand kind="console" />
      <Crumbs crumbs={crumbs} />
      <div className="head-right">
        <Viewing agent={agent} />
        {/* Nothing to sign out of on a machine's own console: it holds no key. */}
        {MODE === "hosted" && <Leave />}
        <ThemeToggle />
      </div>
    </>
  );
}
