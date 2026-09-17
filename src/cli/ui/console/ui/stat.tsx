/** The numbers across the top of a page: one card each, in a grid that wraps. */

import type { ReactNode } from "react";

export function Stats({ min, children }: { min: number; children: ReactNode }): ReactNode {
  return (
    <div className="ui-stats" style={{ gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))` }}>
      {children}
    </div>
  );
}

export type StatSize = "big" | "medium" | "small" | "fact";

/**
 * One number.
 *
 * - big: the home's (25px, and a delta beside it)
 * - medium: the overview's (22px, and "of N" in grey after it)
 * - small: usage and evals (21px)
 * - fact: a session's facts (13.5px, a word rather than a number)
 */
export function Stat({
  label,
  value,
  of,
  delta,
  tone,
  size = "medium",
  accent = false,
}: {
  label: ReactNode;
  value: ReactNode;
  of?: ReactNode | undefined;
  delta?: ReactNode | undefined;
  tone?: "up" | "down" | "flat" | "green" | "red" | undefined;
  size?: StatSize | undefined;
  accent?: boolean | undefined;
}): ReactNode {
  const classes = ["ui-stat"];
  if (size !== "medium") classes.push(`ui-stat-${size}`);
  if (accent) classes.push("ui-stat-accent");
  const valueStyle = tone === "green" ? { color: "var(--green)" } : tone === "red" ? { color: "var(--red)" } : undefined;
  return (
    <div className={classes.join(" ")}>
      <div className="ui-stat-label">{label}</div>
      {size === "big" ? (
        <div className="ui-stat-line">
          <span className="ui-stat-value">{value}</span>
          {delta !== undefined && (
            <span className={tone === "up" ? "ui-stat-delta ui-stat-delta-up" : tone === "down" ? "ui-stat-delta ui-stat-delta-down" : "ui-stat-delta"}>
              {delta}
            </span>
          )}
        </div>
      ) : (
        <div className="ui-stat-value" style={valueStyle}>
          {value}
          {of !== undefined && <span className="ui-stat-of"> {of}</span>}
        </div>
      )}
    </div>
  );
}
