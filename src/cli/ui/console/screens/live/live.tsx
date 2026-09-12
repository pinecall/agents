/** One call being watched: its head, the desk, the transcript in the middle, and the four panels beside it. */

import type { ReactNode } from "react";

import type { Entry } from "@pinecall/protocol";

import { useDeclaredState } from "../../lib/declared-state";
import { Player, recordingIn } from "../sessions/recording";
import { MetricsPanel } from "./metrics-panel";
import { PromptPanel } from "./prompt-panel";
import { RoomPanel } from "./room-panel";
import { StatePanel } from "./state-panel";
import { Supervise } from "./supervise";
import { Timeline } from "./timeline";
import { useWatchedCall } from "./use-watched-call";
import "./live.css";

// Everything on screen comes out of this one hook, so two Lives share nothing at all: two calls
// side by side are two streams, two states and two timelines, keyed by call id in the screen above.
/** A whole call, live or finished. Mounting it opens the stream; leaving closes it. */
export function Live({ call }: { call: string }): ReactNode {
  const watched = useWatchedCall(call);
  const state = watched.state;
  const declared = useDeclaredState(state.agent);
  const recorded = recordingIn(summaryOf(watched.entries));
  return (
    <article className="live">
      <header className="live-head fixed">
        <span className="live-call">{call}</span>
        <span>
          {[state.channel, state.direction].filter((said) => said !== null).join(" · ")}
          {(state.channel !== null || state.direction !== null) && " · "}
          <span className="live-status">{state.status}</span>
        </span>
        {(state.from !== null || state.to !== null) && (
          <span>
            {state.from} <span className="live-arrow">→</span> {state.to}
          </span>
        )}
        <span>
          agent <b>{state.agent_state ?? "—"}</b> · user <b>{state.user_state ?? "—"}</b>
        </span>
        <span>
          seq {state.seq} · <span className="live-connection">{watched.error ?? watched.connection}</span>
        </span>
      </header>
      <Supervise call={call} live={state.status !== "ended"} />
      <div className="live-body">
        <div className="live-middle">
          {recorded !== null && (
            <div className="live-recording">
              <Player call={call} />
            </div>
          )}
          <Timeline entries={watched.entries} state={state} />
        </div>
        <aside className="live-panels">
          <StatePanel fields={state.app_state} declared={declared} />
          <RoomPanel room={state.room} from={state.from} />
          <PromptPanel prompt={state.prompt} />
          <MetricsPanel metrics={state.metrics} entries={watched.entries} />
        </aside>
      </div>
    </article>
  );
}

// The pointer to the audio rides the summary, near the end of a finished call's log.
function summaryOf(entries: Entry[]): Record<string, unknown> | undefined {
  return [...entries].reverse().find((entry) => entry.type === "call.summary")?.data;
}
