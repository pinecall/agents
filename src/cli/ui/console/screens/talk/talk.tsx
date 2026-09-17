/** Talk & Chat: a human reaches the agent from this tab by voice or in writing, and reads the call underneath as the log carries it. */

import type { Entry } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { elapsed } from "../../lib/format";
import { useCall } from "../../lib/use-call";
import { useWhoami } from "../../lib/whoami";
import { useWorld } from "../../lib/world";
import { Button, ButtonLink, Page, PageHead, Refused, Segmented } from "../../ui";
import { Inspector } from "./inspector";
import { Composer, Transcript } from "./lines";
import { useRoom, type Mode, type Talking } from "./use-room";
import "./talk.css";

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "talk", label: "Voice call" },
  { value: "chat", label: "Chat" },
];

/**
 * The screen: the door and the words as they are said; the call, read off its log, beside them.
 * A conversation that ends gives the page back as it was — the door ready again, and the session
 * it left one click away.
 */
export function Talk(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const live = useRoom(agent);
  const whose = useWhoami();
  const { world } = useWorld();
  const [chosen, setChosen] = useState<Mode>("talk");
  const on = live.phase === "live" || live.phase === "connecting";
  const mode = on ? live.mode : chosen;
  const person = whose?.name ?? whose?.label ?? "this key";

  return (
    <div className="talk-grid">
      <Page width={760}>
        <PageHead title={`Talk to ${agent}`} lede="Call it or chat with it from this tab. On a call you can also write — a number, an address — into the same conversation." />

        <div className="talk-card">
          {!on && <Segmented options={MODES} value={chosen} onChange={setChosen} />}
          <Door live={live} mode={mode} />
          <div className="talk-standing">
            <div className="talk-phase">{standing(live, mode)}</div>
            <div className="talk-hint">{hint(live, mode)}</div>
          </div>
          {live.phase === "live" && live.mode === "talk" && (
            <div className="talk-mic">
              <span className={live.muted ? "talk-bars" : "talk-bars talk-bars-on"} aria-hidden>
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
              <Button size="sm" onClick={() => void live.toggleMic()}>
                {live.muted ? "Unmute" : "Mute"}
              </Button>
            </div>
          )}
          {live.phase === "ended" && live.call !== null && (
            <ButtonLink size="sm" to={`/a/${agent}/sessions/${live.call}`}>
              Open the session
            </ButtonLink>
          )}
          {on && live.call !== null && <div className="talk-call">{live.call}</div>}
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
        <Transcript lines={on ? live.lines : []} mode={mode}>
          <Composer open={live.phase === "live"} mode={mode} onWrite={live.write} />
        </Transcript>
        {live.call !== null && <Marks call={live.call} heard={live.heard} />}
      </Page>

      <Inspector agent={agent} call={live.call} />
    </div>
  );
}

// One round button: the accent while out of the room, red while in it, with the clock inside.
function Door({ live, mode }: { live: Talking; mode: Mode }): ReactNode {
  const now = useNow(live.phase === "live");
  if (live.phase === "live" || live.phase === "connecting") {
    return (
      <button type="button" className="talk-door talk-door-on" disabled={live.phase === "connecting"} onClick={() => void live.close()}>
        <span>{live.mode === "talk" ? "Hang up" : "End chat"}</span>
        {live.phase === "live" && <span className="talk-door-clock">{elapsed(live.since, now)}</span>}
      </button>
    );
  }
  return (
    <button type="button" className="talk-door" onClick={() => void live.open(mode)}>
      {mode === "talk" ? "Call" : "Chat"}
    </button>
  );
}

// The log's marks reach the transcript through this: it opens the call's stream and renders
// nothing. The Inspector opens its own, so the two never share a reader.
function Marks({ call, heard }: { call: string; heard: (entry: Entry) => void }): ReactNode {
  useCall(call, { onEntry: heard });
  return null;
}

// What the line under the button says. Nothing is wrong before the button is pressed, so the idle
// line says what to do rather than "not connected", which reads as a fault.
function standing(live: Talking, mode: Mode): string {
  const voice = mode === "talk";
  switch (live.phase) {
    case "idle":
      return voice ? "Ready — press Call" : "Ready — press Chat";
    case "connecting":
      return voice ? "Joining the room…" : "Opening the chat…";
    case "live":
      return voice ? (live.muted ? "On the call — muted" : "On the call — speak or write") : "Chatting — write below";
    case "ended":
      return live.mode === "talk" ? "The call ended" : "The chat ended";
    case "failed":
      return "The room did not open";
  }
}

function hint(live: Talking, mode: Mode): string {
  const voice = mode === "talk";
  switch (live.phase) {
    case "idle":
      return voice ? "The browser asks for the microphone, and the agent answers straight away." : "No microphone and no voice: the agent writes back as it thinks.";
    case "connecting":
      return voice ? "The microphone opens as soon as the room does." : "The agent greets you in a moment.";
    case "live":
      return "Everything said lands in the log beside you.";
    case "ended":
      return "Judged at hang-up. Press the button to start another.";
    case "failed":
      return "Nothing reached the agent. The reason is under the facts.";
  }
}

// The clock is the one thing here that moves without the room saying anything.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!ticking) return;
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(tick);
  }, [ticking]);
  return now;
}
