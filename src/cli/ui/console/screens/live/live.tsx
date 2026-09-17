/** One call being watched: its head, the desk, the log's rows, and the STATE · ROOM · PROMPT · METRICS pane beside them. */

import type { Entry, State } from "@pinecall/protocol";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { useDeclaredState } from "../../lib/declared-state";
import { elapsed, prettyNumber } from "../../lib/format";
import { useScopes } from "../../lib/whoami";
import { Player, recordingIn } from "../sessions/recording";
import { Desk } from "./desk";
import { MetricsPanel } from "./metrics-panel";
import { PromptPanel } from "./prompt-panel";
import { RoomPanel } from "./room-panel";
import { StatePanel } from "./state-panel";
import { usePane } from "../../ui";
import { Timeline } from "./timeline";
import { useWatchedCall } from "./use-watched-call";
import "./live.css";

// Everything on screen comes out of this one hook, so two Lives share nothing at all: two calls
// side by side are two streams, two states and two timelines, keyed by call id in the screen above.
/** A whole call, live or finished. Mounting it opens the stream; leaving closes it. */
export function Live({ call, agent }: { call: string; agent?: string | undefined }): ReactNode {
  const watched = useWatchedCall(call);
  const state = watched.state;
  const declared = useDeclaredState(state.agent);
  const scopes = useScopes();
  const [desk, setDesk] = useState(false);
  const over = state.status === "ended";
  const recorded = recordingIn(summaryOf(watched.entries));
  // A key that does not open `supervise` is refused every move: the desk is not drawn for it.
  const supervises = scopes === null || scopes.includes("supervise");

  const pane = usePane({ name: "live.call", initial: 360, min: 280, max: 640, side: "right" });

  useEffect(() => setDesk(false), [call]);

  return (
    <div className="lv" style={pane.style}>
      {pane.handle}
      <div className="lv-middle">
        <Head call={call} agent={agent} state={state} connection={watched.error ?? watched.connection} failed={watched.error !== null}>
          <Link to={`/sessions/${call}`} className="lv-session">
            Open session
          </Link>
          {supervises && (
            <button
              type="button"
              className={desk ? "lv-listen lv-listen-open" : "lv-listen"}
              disabled={over && !desk}
              title={over ? "the call is over" : undefined}
              onClick={() => setDesk(!desk)}
              aria-expanded={desk}
            >
              <span className={over ? "ui-dot ui-dot-small" : "ui-dot ui-dot-small ui-dot-green"} />
              {desk ? "Close the desk" : "Listen in"}
            </button>
          )}
        </Head>
        {desk && <Desk call={call} live={!over} />}
        <Timeline
          entries={watched.entries}
          state={state}
          after={
            recorded !== null ? (
              <Recorded call={call} />
            ) : undefined
          }
        />
      </div>
      <aside className="lv-pane" aria-label="what the call holds">
        <StatePanel fields={state.app_state} declared={declared} />
        <RoomPanel room={state.room} from={state.from} over={over} />
        <PromptPanel prompt={state.prompt} cost={state.cost} />
        <MetricsPanel metrics={state.metrics} entries={watched.entries} />
      </aside>
    </div>
  );
}

/** The call's head: which call, which door, how it stands, who is on it, and how far the log got. */
function Head({
  call,
  agent,
  state,
  connection,
  failed,
  children,
}: {
  call: string;
  agent: string | undefined;
  state: State;
  connection: string;
  failed: boolean;
  children: ReactNode;
}): ReactNode {
  const now = useNow(state.status !== "ended");
  const over = state.status === "ended";
  const from = state.caller?.name ?? prettyOrAsIs(state.direction === "outbound" ? state.to : state.from);
  return (
    <div className="lv-head">
      <span className="lv-call">{call}</span>
      {state.channel !== null && <span className="lv-tag">{state.channel}</span>}
      {state.direction !== null && <span className="lv-tag">{state.direction}</span>}
      <span className={over ? "lv-status lv-status-over" : "lv-status"}>
        {over ? (state.end_reason ?? "ended").replace(/_/g, " ") : state.status === "active" ? `on a call · ${elapsed(state.started_at, now)}` : state.status}
      </span>
      <span className="lv-sub">
        {from} → {state.agent || agent || "—"} · seq {state.seq}
        {state.agent_state !== null && ` · agent ${state.agent_state}`}
        {state.user_state !== null && ` · caller ${state.user_state}`}
        {" · "}
        <span className={failed ? "lv-connection-bad" : undefined}>{connection}</span>
      </span>
      {children}
    </div>
  );
}

function prettyOrAsIs(number: string | null): string {
  if (number === null) return "—";
  return number.startsWith("+") ? prettyNumber(number) : number;
}

// A live call's clock is the one thing here that moves without the log moving.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!ticking) return;
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(tick);
  }, [ticking]);
  return now;
}

// The pointer to the audio rides the summary, near the end of a finished call's log.
function summaryOf(entries: Entry[]): Record<string, unknown> | undefined {
  return [...entries].reverse().find((entry) => entry.type === "call.summary")?.data;
}

// The call's audio at the foot of its log — and nothing at all when the gateway has none to play.
function Recorded({ call }: { call: string }): ReactNode {
  const [nothing, setNothing] = useState(false);
  const noAudio = useCallback(() => setNothing(true), []);
  if (nothing) return null;
  return (
    <div className="lv-recording">
      <Player call={call} onNothing={noAudio} />
    </div>
  );
}
