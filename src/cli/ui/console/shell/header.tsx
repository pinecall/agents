/** The header strip: where you are on the left, and the one switch the console has on the right. */

import { Fragment, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { currentTheme, toggleTheme, type Theme } from "./theme";
import { Whose } from "./whose";

export function Header({ agent }: { agent: string }): ReactNode {
  const segments = useLocation().pathname.split("/").filter(Boolean);
  // Under an agent the path is /a/<agent>/<screen>; on a fleet screen it is /<screen> or nothing.
  const crumbs = agent === "" ? ["fleet", ...segments] : ["fleet", agent, ...segments.slice(2)];
  return (
    <div className="head">
      <div className="head-crumbs fixed">
        {crumbs.map((crumb, index) => (
          <Fragment key={`${index}-${crumb}`}>
            {index > 0 && <span className="head-sep">/</span>}
            {index === crumbs.length - 1 ? <b>{crumb}</b> : <span>{crumb}</span>}
          </Fragment>
        ))}
      </div>
      <div className="head-right">
        <Whose />
        <ThemeToggle />
      </div>
    </div>
  );
}

/** A hairline glyph that flips the console between daylight and dark, for as long as the tab lives. */
function ThemeToggle(): ReactNode {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const goingTo: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(toggleTheme())}
      aria-label={`Switch to ${goingTo} theme`}
      title={goingTo}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

function Sun(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
      />
    </svg>
  );
}

function Moon(): ReactNode {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeLinejoin="round" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
