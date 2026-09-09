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
  return (
    <section className="talk">
      <header className="talk-head">
        <div className="talk-eyebrow fixed">{agent}</div>
        <h1 className="talk-title">Talk</h1>
        <p className="talk-lede">
          The microphone in this tab joins the agent's room over WebRTC. What is said is drawn word
          by word as the voice says it; the tools, the state and every fact of the call arrive from
          the log underneath, the same log <span className="fixed">pinecall-runtime sessions show</span>{" "}
          prints.
        </p>
      </header>
      <div className="talk-bar">
        <Door live={live} />
        <span className="talk-status">{standing(live)}</span>
        {live.call !== null && <span className="talk-call fixed">{live.call}</span>}
      </div>
      <Transcript lines={live.lines} empty={hint(live.phase)} />
      {live.error !== null && <p className="talk-error">{live.error}</p>}
      {live.call !== null && <Marks call={live.call} heard={live.heard} />}
      {live.call !== null && <Live call={live.call} />}
    </section>
  );
}

function Door({ live }: { live: Talking }): ReactNode {
  if (live.phase === "live" || live.phase === "connecting") {
    return (
      <button type="button" className="door door-stop" disabled={live.phase === "connecting"} onClick={() => void live.close()}>
        Hang up
      </button>
    );
  }
  return (
    <button type="button" className="door door-on" onClick={() => void live.open()}>
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

function standing(live: Talking): string {
  switch (live.phase) {
    case "idle":
      return "not connected";
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
      return "press Talk: the browser asks for the microphone, and the agent answers";
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
