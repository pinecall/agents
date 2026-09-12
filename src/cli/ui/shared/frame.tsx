/** The furniture both pages wear: the frame, the brand, the crumbs, the rail, the empty state. */

import { Fragment, useState, type ReactNode } from "react";
import { NavLink } from "react-router";

import { currentTheme, toggleTheme, type Theme } from "./theme";
import "./styles/frame.css";

/**
 * The frame: a header strip across the top, the rail on the left, the screen beside it.
 *
 * What goes IN the header and IN the rail is each page's own — the console puts the agent it is
 * looking at and the two worlds there, the admin puts neither — so this takes them as children
 * and knows nothing about either page.
 */
export function Frame({
  head,
  rail,
  children,
}: {
  head: ReactNode;
  rail: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <div className="shell">
      <header className="shell-head">{head}</header>
      <div className="shell-body">
        <nav className="shell-rail" aria-label="Screens">
          {rail}
        </nav>
        <main className="shell-screen">{children}</main>
      </div>
    </div>
  );
}

/** The mark and the name, with the word that says WHICH page this is: `console` or `admin`. */
export function Brand({ kind }: { kind: string }): ReactNode {
  return (
    <div className="brand">
      <img className="brand-mark" src="/logo-mark.png" alt="" />
      <span className="brand-name fixed">
        pinecall <span className="brand-sep">/</span> <span className="brand-kind">{kind}</span>
      </span>
    </div>
  );
}

/** Where you are, as the path reads: the last one is where you stand. */
export function Crumbs({ crumbs }: { crumbs: readonly string[] }): ReactNode {
  return (
    <nav className="head-crumbs fixed" aria-label="Where you are">
      {crumbs.map((crumb, index) => (
        <Fragment key={`${index}-${crumb}`}>
          {index > 0 && <span className="head-sep">/</span>}
          {index === crumbs.length - 1 ? <b>{crumb}</b> : <span>{crumb}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

/** The switch that flips a page between daylight and dark, for as long as the tab lives. */
export function ThemeToggle(): ReactNode {
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

/** One labelled group of the rail: the slug it acts on, or GATEWAY, or BOX. */
export function RailGroup({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="rail-group">
      <p className="rail-label fixed">{label}</p>
      <div className="rail-links">{children}</div>
    </div>
  );
}

/** One screen in the rail. `hint` is the count that screen would show, when it has one. */
export function RailLink({
  to,
  name,
  hint = "",
  end = false,
}: {
  to: string;
  name: string;
  hint?: string;
  end?: boolean;
}): ReactNode {
  return (
    <NavLink to={to} end={end} className={railLink}>
      <span>{name}</span>
      {hint !== "" && <span className="rail-hint fixed">{hint}</span>}
    </NavLink>
  );
}

/** What a screen says when it has nothing to show: a sentence, never a spinner. */
export function Nothing({ children }: { children: ReactNode }): ReactNode {
  return <p className="nothing">{children}</p>;
}

/** The class a rail link wears, lit when it is the screen on show. */
function railLink({ isActive }: { isActive: boolean }): string {
  return isActive ? "rail-link rail-link-here" : "rail-link";
}
