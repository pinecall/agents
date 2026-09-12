/** The header strip: the mark and where you are on the left; the agent, the world, whose, and the theme on the right. */

import { Fragment, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { AgentSelect } from "./agent-select";
import { currentTheme, toggleTheme, type Theme } from "./theme";
import { Whose } from "./whose";
import { WorldToggle } from "./world-toggle";

export function Header({ agent }: { agent: string }): ReactNode {
  const segments = useLocation().pathname.split("/").filter(Boolean);
  // Under an agent the path is /a/<agent>/<screen>; on an org screen it is /<screen> or nothing.
  const crumbs = agent === "" ? ["fleet", ...segments] : ["fleet", agent, ...segments.slice(2)];
  return (
    <>
      <div className="brand">
        <img className="brand-mark" src="/logo-mark.png" alt="" />
        <span className="brand-name fixed">
          pinecall <span className="brand-sep">/</span> <span className="brand-kind">console</span>
        </span>
      </div>
      <nav className="head-crumbs fixed" aria-label="Where you are">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${index}-${crumb}`}>
            {index > 0 && <span className="head-sep">/</span>}
            {index === crumbs.length - 1 ? <b>{crumb}</b> : <span>{crumb}</span>}
          </Fragment>
        ))}
      </nav>
      <div className="head-right">
        <AgentSelect agent={agent} />
        <WorldToggle />
        <Whose />
        <ThemeToggle />
      </div>
    </>
  );
}

/** The switch that flips the console between daylight and dark, for as long as the tab lives. */
function ThemeToggle(): ReactNode {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const goingTo: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle fixed"
      onClick={() => setTheme(toggleTheme())}
      aria-label={`Switch to ${goingTo} theme`}
      title={goingTo}
    >
      <span className="theme-dot" aria-hidden />
      {theme}
    </button>
  );
}
