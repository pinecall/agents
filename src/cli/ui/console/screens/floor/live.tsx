/** Live: the floor's calls down the left, the one chosen watched beside them — its log, its state, and the desk. */

import type { SessionLine } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { EVERY_MS, isLive } from "../../lib/use-agent-sessions";
import { ago, duration, elapsed, whoOn } from "../../lib/format";
import { useOrg } from "../../lib/org";
import { Dot, Input, Pill, usePane } from "../../ui";
import { Live } from "../live";
import { matches } from "../sessions/search";
import "./live.css";

// A screenful and then some: the floor lists the org's newest calls, and older ones are Sessions'.
const ROWS = 80;

/**
 * The floor. The rows are the org's sessions door (re-asked on a clock, and the moment the org's
 * stream says something moved), live ones first. The URL decides which call is watched; with none
 * in it, the newest live call is, and failing that the newest call.
 */
export function FloorLive(): ReactNode {
  const { lines, floorError } = useOrg();
  const chosen = useParams()["call"];
  const [search, setSearch] = useSearchParams();
  const only = search.get("agent");
  const [query, setQuery] = useState("");
  const pane = usePane({ name: "live.calls", initial: 300, min: 220, max: 520, side: "left" });
  const now = useNow();

  const shown = lines.filter((line) => (only === null || line.agent === only) && matches(line, query));
  const live = shown.filter(isLive);
  const ended = shown.filter((line) => !isLive(line)).slice(0, ROWS);
  const rows = [...live, ...ended];
  const watched = chosen ?? live[0]?.call ?? rows[0]?.call;
  const suffix = only === null ? "" : `?agent=${encodeURIComponent(only)}`;

  return (
    <div className="fl" style={pane.style}>
      {pane.handle}
      <nav className="fl-side" aria-label="the floor's calls">
        <div className="fl-side-head">
          <div className="fl-standing">
            <Dot tone={live.length > 0 ? "green" : undefined} />
            <span className="fl-count">{live.length === 1 ? "1 call up" : `${live.length} calls up`}</span>
            <span className="fl-asked" title={`re-asked every ${EVERY_MS / 1000} s`}>
              {shown.length} listed
            </span>
          </div>
          <Input
            size="sm"
            className="fl-search"
            placeholder="Search a number, agent or outcome"
            aria-label="Search the floor's calls"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {only !== null && (
            <div className="fl-only">
              <span className="ui-clip">{only}</span>
              <button
                type="button"
                className="fl-only-clear"
                onClick={() => {
                  search.delete("agent");
                  setSearch(search);
                }}
              >
                every agent
              </button>
            </div>
          )}
        </div>
        <div className="fl-list">
          {floorError !== null && <p className="fl-empty fl-refused">{floorError}</p>}
          {rows.length === 0 && floorError === null && (
            <p className="fl-empty">
              {query === "" ? "No calls yet. Leave this open — a call that reaches any agent shows up here as it rings." : "No call here matches."}
            </p>
          )}
          {live.length > 0 && <div className="fl-label">On a call now</div>}
          {live.map((line) => (
            <FloorRow key={line.call} line={line} on={line.call === watched} now={now} to={`/live/${line.call}${suffix}`} />
          ))}
          {ended.length > 0 && <div className="fl-label">Recent</div>}
          {ended.map((line) => (
            <FloorRow key={line.call} line={line} on={line.call === watched} now={now} to={`/live/${line.call}${suffix}`} />
          ))}
          {ended.length > 0 && (
            <Link to="/sessions" className="fl-all">
              Every session →
            </Link>
          )}
        </div>
      </nav>
      {watched === undefined ? (
        <div className="fl-nothing">Nothing to watch yet: the first call the org takes appears on the left, and opens here.</div>
      ) : (
        <Live key={watched} call={watched} agent={rows.find((line) => line.call === watched)?.agent} />
      )}
    </div>
  );
}

/** One call: who is on it and how it stands, then which agent, which door, and how the judges answered. */
function FloorRow({ line, on, now, to }: { line: SessionLine; on: boolean; now: number; to: string }): ReactNode {
  const up = isLive(line);
  return (
    <Link to={to} className={on ? "fl-row fl-row-on" : "fl-row"} title={line.call}>
      <span className={up ? "fl-dot fl-dot-live" : "fl-dot"} />
      <span className="fl-row-words">
        <span className="fl-row-top">
          <span className="fl-id">{whoOn(line)}</span>
          <span className={up ? "fl-meta fl-meta-live" : "fl-meta"}>{up ? (line.status === "active" ? elapsed(line.started_at, now) : line.status) : ago(line.started_at, now)}</span>
        </span>
        <span className="fl-row-sub">
          <span className="ui-clip">
            {line.agent}
            {line.channel !== null && ` · ${line.channel}`}
            {line.direction === "outbound" && " · outbound"}
            {!up && ` · ${duration(line)}`}
          </span>
          {line.score != null && (
            <span className="fl-score">
              <Pill tone={line.score.passed ? "green" : "red"}>
                {line.score.held}/{line.score.judged}
              </Pill>
            </span>
          )}
          {line.score == null && (line.flags ?? []).includes("escalated") && (
            <span className="fl-score">
              <Pill tone="amber">escalated</Pill>
            </span>
          )}
        </span>
        {!up && line.outcome !== null && <span className="fl-outcome">{line.outcome}</span>}
      </span>
    </Link>
  );
}

// The live rows' clocks tick without the log moving.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(tick);
  }, []);
  return now;
}
