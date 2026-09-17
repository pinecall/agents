/** Live: the floor's calls down the left, the one chosen watched beside them — its log, its state, and the desk. */

import type { SessionLine } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { EVERY_MS, isLive } from "../../lib/use-agent-sessions";
import { elapsed, whoOn } from "../../lib/format";
import { useOrg } from "../../lib/org";
import { Dot } from "../../ui";
import { SimulateForm } from "../calls/simulate-form";
import { Live } from "../live";
import "./live.css";

// A screenful and then some: the floor lists the org's newest calls, and older ones are Sessions'.
const ROWS = 80;

/**
 * The floor. The rows are the org's sessions door (re-asked on a clock, and the moment the org's
 * stream says something moved), live ones first. The URL decides which call is watched; with none
 * in it, the newest live call is, and failing that the newest call.
 */
export function FloorLive(): ReactNode {
  const { lines, agents, floorError } = useOrg();
  const chosen = useParams()["call"];
  const [search, setSearch] = useSearchParams();
  const only = search.get("agent");
  const [simulating, setSimulating] = useState(false);
  const now = useNow();

  const shown = lines.filter((line) => only === null || line.agent === only);
  const live = shown.filter(isLive);
  const rows = [...live, ...shown.filter((line) => !isLive(line))].slice(0, ROWS);
  const watched = chosen ?? live[0]?.call ?? rows[0]?.call;
  const suffix = only === null ? "" : `?agent=${encodeURIComponent(only)}`;

  return (
    <div className="fl">
      <nav className="fl-side" aria-label="the floor's calls">
        <div className="fl-side-head">
          <div className="fl-standing">
            <Dot tone={live.length > 0 ? "green" : undefined} />
            <span className="fl-count">{live.length === 1 ? "1 call up" : `${live.length} calls up`}</span>
            <span className="fl-asked">re-asked every {EVERY_MS / 1000} s</span>
          </div>
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
          <button type="button" className="fl-simulate" onClick={() => setSimulating(!simulating)} aria-expanded={simulating}>
            Simulate a caller
          </button>
          {simulating && (
            <div className="fl-sim">
              <SimulateForm
                agents={only !== null ? [only] : agents.map((one) => one.slug)}
                onClose={() => setSimulating(false)}
              />
            </div>
          )}
        </div>
        <div className="fl-list">
          <div className="fl-label">Sessions</div>
          {floorError !== null && <p className="fl-empty fl-refused">{floorError}</p>}
          {rows.length === 0 && floorError === null && (
            <p className="fl-empty">No calls yet. Leave this open — a call that reaches any agent shows up here as it rings.</p>
          )}
          {rows.map((line) => (
            <FloorRow key={line.call} line={line} on={line.call === watched} now={now} to={`/live/${line.call}${suffix}`} />
          ))}
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

function FloorRow({ line, on, now, to }: { line: SessionLine; on: boolean; now: number; to: string }): ReactNode {
  const up = isLive(line);
  return (
    <Link to={to} className={on ? "fl-row fl-row-on" : "fl-row"} title={`${line.agent} · ${line.call}`}>
      <span className={up ? "fl-dot fl-dot-live" : "fl-dot"} />
      <span className="fl-id">{whoOn(line)}</span>
      <span className={up ? "fl-meta fl-meta-live" : "fl-meta"}>{up ? (line.status === "active" ? elapsed(line.started_at, now) : line.status) : "ended"}</span>
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
