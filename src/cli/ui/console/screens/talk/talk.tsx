/** Talk: a human reaches the agent from this tab, and reads the call underneath as the log carries it. */

import type { Entry } from "@pinecall/protocol";
import type { ReactNode } from "react";
import { useParams } from "react-router";

import { useCall } from "../../lib/use-call";
import { Live } from "../live";
import { Transcript } from "./lines";
import { useRoom, type Phase, type Talking } from "./use-room";
import "./talk.css";

/** The screen: the door, the words as they are said, and the whole call as the log has it. */
export function Talk(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const live = useRoom(agent);
  const on = live.phase === "live" || live.phase === "connecting";
  return (
    <section className="talk">
      <div className="talk-column">
        <h1 className="talk-title">Talk to {agent}</h1>
        <p className="talk-lede">
          This machine's microphone reaches the agent. The call is the same log everything else reads.
        </p>
        <div className="talk-door-row">
          <Door live={live} />
          <div className="talk-standing">
            <span className="talk-phase">{standing(live)}</span>
            <span className="talk-signal">
              <span className={on ? "talk-bars talk-bars-on" : "talk-bars"} aria-hidden>
                <span />
                <span />
                <span />
              </span>
              {live.call !== null && <span className="talk-call fixed">{live.call}</span>}
            </span>
          </div>
        </div>
        <Transcript lines={live.lines} empty={hint(live.phase)} />
        {live.error !== null && <p className="talk-error fixed">{live.error}</p>}
      </div>
      {live.call !== null && <Marks call={live.call} heard={live.heard} />}
      {live.call !== null && (
        <div className="talk-whole">
          <Live call={live.call} />
        </div>
      )}
    </section>
  );
}

// One round button: filled while the line is open, outlined while it is not.
function Door({ live }: { live: Talking }): ReactNode {
  if (live.phase === "live" || live.phase === "connecting") {
    return (
      <button type="button" className="door door-on" disabled={live.phase === "connecting"} onClick={() => void live.close()}>
        Hang up
      </button>
    );
  }
  return (
    <button type="button" className="door" onClick={() => void live.open()}>
      {live.phase === "idle" ? "Talk" : "Talk again"}
    </button>
  );
}

// The log's marks reach the transcript through this: it opens the call's stream and renders
// nothing. Live below opens its own, so the two never share a reader.
function Marks({ call, heard }: { call: string; heard: (entry: Entry) => void }): ReactNode {
  useCall(call, { onEntry: heard });
  return null;
}

// What the big line beside the button says. The idle one is the whole reason this function has a
// comment: it used to read "not connected", which is the first thing on the screen and reads as a
// FAULT — three people in a row opened a working agent and thought it was broken. Nothing is
// wrong before you press the button, and the line now says what to do instead of what is absent.
function standing(live: Talking): string {
  switch (live.phase) {
    case "idle":
      return "ready — press Talk";
    case "connecting":
      return "joining the room…";
    case "live":
      return "on the call · speak";
    case "ended":
      return "hung up";
    case "failed":
      return "the room did not open";
  }
}

function hint(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "the browser will ask for the microphone, and the agent answers straight away";
    case "connecting":
      return "joining the room…";
    case "live":
      return "listening — say something";
    case "ended":
      return "the call ended";
    case "failed":
      return "the room did not open";
  }
}
