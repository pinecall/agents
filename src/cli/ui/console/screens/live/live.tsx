/** One call being watched: its head, the transcript in the middle, and the four panels beside it. */

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
      <header className="live-head">
        <span className="live-call fixed">{call}</span>
        <span className="live-what">{howItStands(state.channel, state.direction, state.status)}</span>
        <span className="live-line fixed">
          {state.from} → {state.to}
        </span>
        <span className="live-doing">
          {state.agent_state ?? "—"} · {state.user_state ?? "—"}
        </span>
        <span className="live-seq fixed">
          seq {state.seq} · {watched.error ?? watched.connection}
        </span>
        <Supervise call={call} live={state.status !== "ended"} />
      </header>
      {recorded !== null && (
        <div className="live-recording">
          <Player call={call} />
        </div>
      )}
      <div className="live-body">
        <Timeline entries={watched.entries} state={state} />
        <aside className="live-panels">
          <StatePanel fields={state.app_state} declared={declared} />
          <PromptPanel prompt={state.prompt} />
          <RoomPanel room={state.room} from={state.from} />
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

function howItStands(channel: string | null, direction: string | null, status: string): string {
  return [channel, direction, status].filter((said) => said !== null).join(" · ");
}
