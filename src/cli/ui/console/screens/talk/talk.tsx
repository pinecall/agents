/** Talk: join the agent's room by voice or in writing, the conversation filling the page, and the call read off its log beside it. */

import type { Entry } from "@pinecall/protocol";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { elapsed } from "../../lib/format";
import { useCall } from "../../lib/use-call";
import { useWhoami } from "../../lib/whoami";
import { useWorld } from "../../lib/world";
import { Button, ButtonLink, Segmented } from "../../ui";
import { Inspector } from "./inspector";
import { Composer, Transcript } from "./lines";
import { useRoom, type Mode, type Talking } from "./use-room";
import "./talk.css";

const MODES: readonly { value: Mode; label: string }[] = [
  { value: "talk", label: "Voice call" },
  { value: "chat", label: "Chat" },
];

/**
 * The screen. Before a room is joined the conversation's place says how to join it; once joined
 * the bar says how it stands and holds the moves, and what is typed goes into the same call — a
 * voice call takes writing too, which is how a number or an address is given without spelling it.
 */
export function Talk(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const live = useRoom(agent);
  const [mode, setMode] = useState<Mode>("talk");
  const on = live.phase === "live" || live.phase === "connecting";

  return (
    <div className="talk-grid">
      <section className="talk-main" aria-label={`Talk to ${agent}`}>
        <Bar agent={agent} live={live} />
        {live.lines.length === 0 && !on ? (
          <Lobby agent={agent} live={live} mode={mode} onMode={setMode} />
        ) : (
          <Transcript lines={live.lines} />
        )}
        {live.error !== null && <p className="talk-refused">{live.error}</p>}
        {(on || live.lines.length > 0) && (
          <Composer open={live.phase === "live"} mode={live.mode} onWrite={live.write} />
        )}
        {live.call !== null && <Marks call={live.call} heard={live.heard} />}
      </section>

      <Inspector agent={agent} call={live.call} />
    </div>
  );
}

// The agent's own head names it right above, so the bar names the conversation instead.
/** The head of the conversation: which one, how it stands, and the moves the moment allows. */
function Bar({ agent, live }: { agent: string; live: Talking }): ReactNode {
  const now = useNow(live.phase === "live");
  const voice = live.mode === "talk";
  return (
    <header className="talk-bar">
      <span className={live.phase === "live" ? "talk-light talk-light-on" : "talk-light"} aria-hidden />
      <div className="talk-bar-words">
        <div className="talk-agent">{live.phase === "idle" ? "Talk" : voice ? "Voice call" : "Chat"}</div>
        <div className="talk-standing">{standing(live, now)}</div>
      </div>
      <div className="talk-moves">
        {live.phase === "live" && voice && (
          <>
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
          </>
        )}
        {(live.phase === "live" || live.phase === "connecting") && (
          <Button kind="danger" size="sm" disabled={live.phase === "connecting"} onClick={() => void live.close()}>
            {voice ? "Leave" : "End chat"}
          </Button>
        )}
        {(live.phase === "ended" || live.phase === "failed") && live.lines.length > 0 && (
          <>
            {live.call !== null && (
              <ButtonLink size="sm" to={`/a/${agent}/sessions/${live.call}`}>
                Open session
              </ButtonLink>
            )}
            <Button kind="primary" size="sm" onClick={() => void live.open(live.mode)}>
              {voice ? "Join again" : "Chat again"}
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

/** Before anything was said: how to join, and what joining means. */
function Lobby({ agent, live, mode, onMode }: { agent: string; live: Talking; mode: Mode; onMode: (mode: Mode) => void }): ReactNode {
  const whose = useWhoami();
  const { world } = useWorld();
  const person = whose?.name ?? whose?.label ?? "this key";
  return (
    <div className="talk-lobby">
      <div className="talk-lobby-card">
        <div className="talk-lobby-title">Talk to {agent}</div>
        <p className="talk-lobby-words">
          {mode === "talk"
            ? "Join the agent's room with this machine's microphone. It answers out loud, and you can write into the same call whenever typing is easier."
            : "A written conversation: no microphone, no voice. The agent writes back as it thinks, with the same tools, memory and knowledge."}
        </p>
        <Segmented options={MODES} value={mode} onChange={onMode} />
        <Button kind="primary" size="lg" className="talk-join" onClick={() => void live.open(mode)}>
          {mode === "talk" ? "Join room" : "Start chat"}
        </Button>
        <div className="talk-lobby-facts">
          As {person} · lands in {world} · counts in usage
        </div>
        {live.phase === "failed" && <div className="talk-lobby-failed">The room did not open. The reason is below.</div>}
      </div>
    </div>
  );
}

function standing(live: Talking, now: number): string {
  const voice = live.mode === "talk";
  switch (live.phase) {
    case "idle":
      return "Not in the room";
    case "connecting":
      return voice ? "Joining the room…" : "Opening the chat…";
    case "live":
      return `${voice ? (live.muted ? "On the call · muted" : "On the call") : "Chatting"} · ${elapsed(live.since, now)}`;
    case "ended":
      return voice ? "The call ended — judged at hang-up, in Sessions" : "The chat ended — judged at hang-up, in Sessions";
    case "failed":
      return "The room did not open";
  }
}

// The log's marks reach the transcript through this: it opens the call's stream and renders
// nothing. The Inspector opens its own, so the two never share a reader.
function Marks({ call, heard }: { call: string; heard: (entry: Entry) => void }): ReactNode {
  useCall(call, { onEntry: heard });
  return null;
}

// The clock is the one thing on the bar that moves without the room saying anything.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!ticking) return;
    const tick = window.setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => window.clearInterval(tick);
  }, [ticking]);
  return now;
}
