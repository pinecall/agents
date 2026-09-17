/** Chat: the agent written to from this tab — no microphone and no voice — in one window, with the call read off its log beside it. */

import type { Entry } from "@pinecall/protocol";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router";

import { elapsed } from "../../lib/format";
import { useCall } from "../../lib/use-call";
import { useWorld } from "../../lib/world";
import { Button, ButtonLink, Refused } from "../../ui";
import { Inspector } from "./inspector";
import { Composer, Transcript } from "./lines";
import { useRoom, type Talking } from "./use-room";
import "./room-chat.css";

/**
 * The screen. A chat is a written session of the same room Talk speaks in: the agent has no ears
 * and no voice for it, and writes back as it thinks. It is a window and not a page: a conversation
 * has a size, and a chat stretched over a wide screen is a chat nobody can read. The rail and the
 * inspector stay where they are on every other screen: only the conversation is the window.
 */
export function RoomChat(): ReactNode {
  const agent = useParams()["agent"] ?? "";
  const live = useRoom(agent);
  const { world } = useWorld();
  const on = live.phase === "live" || live.phase === "connecting";

  // Opening the tab IS starting the chat: a screen whose first act is always the same button is a
  // button nobody wanted. It runs once per agent — a chat that ended is started again by hand.
  const opening = useRef("");
  useEffect(() => {
    if (agent === "" || opening.current === agent) return;
    opening.current = agent;
    void live.open("chat");
  }, [agent, live]);

  return (
    <div className="rchat-grid">
      <div className="rchat-stage">
        <section className="rchat" aria-label={`Chat with ${agent}`}>
          <Bar agent={agent} live={live} world={world} />
          {on || live.lines.length > 0 ? <Transcript lines={live.lines} mode="chat" /> : <Empty agent={agent} live={live} />}
          {live.error !== null && <p className="rchat-refused">{live.error}</p>}
          <Composer open={live.phase === "live"} mode="chat" onWrite={live.write} />
          {live.call !== null && <Marks call={live.call} heard={live.heard} />}
        </section>
      </div>

      <Inspector agent={agent} call={live.call} />
    </div>
  );
}

/** The one bar: how the chat stands, and the move it allows. */
function Bar({ agent, live, world }: { agent: string; live: Talking; world: string }): ReactNode {
  const now = useNow(live.phase === "live");
  return (
    <header className="rchat-bar">
      <span className={live.phase === "live" ? "rchat-light rchat-light-on" : "rchat-light"} aria-hidden />
      <div className="rchat-words">
        <div className="rchat-title">Chat with {agent}</div>
        <div className="rchat-standing">{standing(live, now, world)}</div>
      </div>
      <div className="rchat-moves">
        {live.phase === "ended" && live.call !== null && (
          <ButtonLink size="sm" to={`/a/${agent}/sessions/${live.call}`}>
            Open the session
          </ButtonLink>
        )}
        {live.phase === "live" || live.phase === "connecting" ? (
          <Button kind="danger" size="sm" disabled={live.phase === "connecting"} onClick={() => void live.close()}>
            End chat
          </Button>
        ) : (
          <Button kind="primary" size="sm" onClick={() => void live.open("chat")}>
            {live.lines.length === 0 ? "Start a chat" : "Start another"}
          </Button>
        )}
      </div>
    </header>
  );
}

/** Before the first chat of this tab: what it is, where it lands, and the button is in the bar. */
function Empty({ agent, live }: { agent: string; live: Talking }): ReactNode {
  return (
    <div className="rchat-empty">
      <p className="rchat-empty-words">
        {live.phase === "connecting"
          ? `Opening a written room with ${agent}…`
          : `Write to ${agent} as a visitor would. No microphone and no voice: the agent answers in writing, with the same tools, memory and knowledge, and the call is judged at hang-up like any other.`}
      </p>
      {live.phase === "failed" && <p className="rchat-empty-failed">The room did not open. The reason is below.</p>}
    </div>
  );
}

function standing(live: Talking, now: number, world: string): string {
  switch (live.phase) {
    case "idle":
      return `Not started — it lands in ${world} and counts in usage`;
    case "connecting":
      return "Opening the room…";
    case "live":
      return `Chatting · ${elapsed(live.since, now)}`;
    case "ended":
      return "The chat ended — judged at hang-up, in Sessions";
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
