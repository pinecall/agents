/** Talk: a human reaches the agent from this tab, and reads the call underneath as the log carries it. */

import type { Entry } from "@pinecall/protocol";
import type { ReactNode } from "react";
import { useParams } from "react-router";

import { useCall } from "../../lib/use-call";
import { useWhoami } from "../../lib/whoami";
import { useWorld } from "../../lib/world";
import { Page, PageHead, Refused } from "../../ui";
import { Inspector } from "./inspector";
import { Composer, Transcript } from "./lines";
import { useRoom, type Phase, type Talking } from "./use-room";
import "./talk.css";

/** The screen: the door and the words as they are said; the call, read off its log, beside them. */
export function Talk(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const live = useRoom(agent);
  const whose = useWhoami();
  const { world } = useWorld();
  const on = live.phase === "live" || live.phase === "connecting";
  const person = whose?.name ?? whose?.label ?? "this key";

  return (
    <div className="talk-grid">
      <Page width={760}>
        <PageHead title={`Talk to ${agent}`} lede="Speak or write: this machine's microphone reaches the agent, and so does what you type. The call is the same log everything else reads." />

        <div className="talk-card">
          <Door live={live} />
          <div className="talk-standing">
            <div className="talk-phase">{standing(live.phase)}</div>
            <div className="talk-hint">{hint(live.phase)}</div>
          </div>
          <div className={on ? "talk-bars talk-bars-on" : "talk-bars"} aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          {live.call !== null && <div className="talk-call">{live.call}</div>}
        </div>

        <div className="talk-facts">
          <div className="talk-fact">
            <div className="talk-fact-label">Speaking as</div>
            <div className="talk-fact-value">{person} · you</div>
          </div>
          <div className="talk-fact">
            <div className="talk-fact-label">Lands in</div>
            <div className="talk-fact-value">{world} · counts in usage</div>
          </div>
        </div>

        <Refused>{live.error}</Refused>
        <Transcript lines={live.lines}>
          <Composer open={live.phase === "live"} onWrite={live.write} />
        </Transcript>
        {live.call !== null && <Marks call={live.call} heard={live.heard} />}
      </Page>

      <Inspector agent={agent} call={live.call} />
    </div>
  );
}

// One round button: the accent while the line is closed, red while it is open.
function Door({ live }: { live: Talking }): ReactNode {
  if (live.phase === "live" || live.phase === "connecting") {
    return (
      <button type="button" className="talk-door talk-door-on" disabled={live.phase === "connecting"} onClick={() => void live.close()}>
        Hang up
      </button>
    );
  }
  return (
    <button type="button" className="talk-door" onClick={() => void live.open()}>
      {live.phase === "idle" ? "Talk" : "Again"}
    </button>
  );
}

// The log's marks reach the transcript through this: it opens the call's stream and renders
// nothing. The Inspector opens its own, so the two never share a reader.
function Marks({ call, heard }: { call: string; heard: (entry: Entry) => void }): ReactNode {
  useCall(call, { onEntry: heard });
  return null;
}

// What the line under the button says. The idle one used to read "not connected", which is the
// first thing on the screen and reads as a FAULT — three people in a row opened a working agent and
// thought it was broken. Nothing is wrong before you press the button, so it says what to do.
function standing(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "Ready — press Talk";
    case "connecting":
      return "Joining the room…";
    case "live":
      return "On the call — speak or write";
    case "ended":
      return "Hung up";
    case "failed":
      return "The room did not open";
  }
}

function hint(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "The browser will ask for the microphone, and the agent answers straight away.";
    case "connecting":
      return "The microphone opens as soon as the room does.";
    case "live":
      return "Listening. Everything said lands in the log beside you.";
    case "ended":
      return "The call ended. Its session is in Sessions, judged at hang-up.";
    case "failed":
      return "Nothing reached the agent. The reason is under the button.";
  }
}
