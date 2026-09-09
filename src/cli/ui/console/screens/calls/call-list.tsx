/** The left column: the calls happening now, and under them the ones that already hung up. */

import type { SessionLine } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router";

import { isLive } from "../../lib/use-agent-sessions";
import { Nothing } from "../../shell/nothing";
import { glyphOf } from "./channel-glyph";

/** Every call this agent's log names. Selecting one is a URL, so the list holds no selection. */
export function CallList({
  agent,
  lines,
  standing,
}: {
  agent: string;
  lines: SessionLine[];
  standing: string;
}): ReactNode {
  const now = useNow();
  const live = lines.filter(isLive);
  const over = lines.filter((line) => !isLive(line));

  return (
    <nav className="call-list">
      <p className="call-list-standing fixed">{standing}</p>
      {lines.length === 0 ? (
        <Nothing>No calls yet. The first one to reach this agent appears here as it rings.</Nothing>
      ) : null}
      <Group name="Live" agent={agent} lines={live} now={now} />
      <Group name="Recent" agent={agent} lines={over} now={now} />
    </nav>
  );
}

function Group({
  name,
  agent,
  lines,
  now,
}: {
  name: string;
  agent: string;
  lines: SessionLine[];
  now: number;
}): ReactNode {
  if (lines.length === 0) {
    return null;
  }
  return (
    <section className="call-group">
      <h2 className="call-group-name">{name}</h2>
      {lines.map((line) => (
        <NavLink
          key={line.call}
          to={`/a/${agent}/calls/${line.call}`}
          className={({ isActive }) => (isActive ? "call-line call-line-here" : "call-line")}
        >
          <span className="call-line-glyph">{glyphOf(line.channel)}</span>
          <span className="call-line-who">{whoIsOn(line)}</span>
          <span className="call-line-when fixed">{when(line, now)}</span>
        </NavLink>
      ))}
    </section>
  );
}

// The contact's name when the platform recognised the caller, and the number it came from when it
// did not: those are the only two things known about who is on the line before anybody speaks.
function whoIsOn(line: SessionLine): string {
  return line.caller?.name ?? line.from ?? line.call;
}

// A call that is up shows how long it has been up; one that is not shows where it is instead —
// ringing, dialing, ended. Both fit the same column.
function when(line: SessionLine, now: number): string {
  if (!isLive(line) || line.started_at === null) {
    return line.status;
  }
  const seconds = Math.max(0, Math.round(now - line.started_at));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// A live call's timer is the one thing on this screen that moves without the log moving, so it has
// a clock of its own — one per mounted list, ticking a second at a time.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(tick);
  }, []);
  return now;
}
