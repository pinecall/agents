/** The conversation as bubbles: what you wrote on the right, what the agent answered on the left, a tool between. */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { rowsOf } from "../live/timeline-rows";
import { useWatchedCall } from "../live/use-watched-call";
import { repliesOf, useRevealed } from "./streaming";

// The column says who: the person typing is YOU; the agent is the agent; a tool is the tool's name.
const WHO = { user: "you", agent: "agent" } as const;

// How close to the foot counts as "at the foot": a reader who scrolled up to read something is
// left there; one who is following the conversation is kept at its last line.
const FOLLOWING_PX = 80;

/** A line you sent that the log has not confirmed yet: on screen at once, greyed. */
export interface Pending {
  id: number;
  text: string;
}

/**
 * Every turn of the call so far, every tool between them, the reply being written, and the lines
 * you sent that are still on their way. A reply fills character by character on
 * requestAnimationFrame and carries on into its settled bubble without drawing twice.
 */
export function Bubbles({ call, pending, onConfirmed }: { call: string; pending: Pending[]; onConfirmed: (text: string) => void }): ReactNode {
  const watched = useWatchedCall(call);
  const rows = rowsOf(watched.entries, watched.state);
  const { streaming, settled } = repliesOf(watched.entries);
  const box = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  // A call opened from the list is read, not watched: what it said long ago appears whole.
  const [opened] = useState(() => performance.now());
  const [live, setLive] = useState(false);
  useEffect(() => {
    const later = window.setTimeout(() => setLive(true), 600);
    return () => window.clearTimeout(later);
  }, [opened]);

  // The user's own turns, confirmed: the pending line with that text is taken off.
  const users = rows.filter((row) => row.kind === "turn" && row.turn.role === "user").length;
  useEffect(() => {
    const last = [...rows].reverse().find((row) => row.kind === "turn" && row.turn.role === "user");
    if (last?.kind === "turn") onConfirmed(last.turn.text);
  }, [users]);

  const writing = [...streaming.entries()].filter(([speech]) => !settled.has(speech));
  const thinking = watched.state.agent_state === "thinking" && writing.length === 0;

  // Kept at the foot on every frame the content grows, unless the reader scrolled away.
  useLayoutEffect(() => {
    const element = box.current;
    if (element !== null && following.current) element.scrollTop = element.scrollHeight;
  });

  return (
    <div
      className="chat-lines"
      ref={box}
      onScroll={(event) => {
        const element = event.currentTarget;
        following.current = element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOWING_PX;
      }}
    >
      {rows.map((row) => {
        if (row.kind === "turn") {
          const speech = row.turn.speech_id ?? `seq-${String(row.seq)}`;
          return row.turn.role === "agent" ? (
            <AgentBubble key={`turn-${String(row.seq)}`} speech={speech} text={row.turn.text} instant={!live} done />
          ) : (
            <div className="chat-line chat-line-user" key={`turn-${String(row.seq)}`}>
              <span className="chat-who fixed">{WHO.user}</span>
              <span className="chat-bubble">{row.turn.text}</span>
            </div>
          );
        }
        if (row.kind === "tool") {
          return (
            <div className="chat-line chat-line-tool" key={`tool-${String(row.seq)}`}>
              <span className="chat-tool fixed">
                <span className={`chat-tool-dot chat-tool-${row.run.status}`} />
                {row.run.name}
                <span className="chat-tool-result">
                  {row.run.error ?? row.run.summary ?? (row.run.status === "running" ? "running…" : "done")}
                </span>
              </span>
            </div>
          );
        }
        return null;
      })}
      {writing.map(([speech, text]) => (
        <AgentBubble key={`writing-${speech}`} speech={speech} text={text} instant={false} done={false} />
      ))}
      {pending.map((line) => (
        <div className="chat-line chat-line-user chat-line-pending" key={`pending-${String(line.id)}`}>
          <span className="chat-who fixed">{WHO.user}</span>
          <span className="chat-bubble">{line.text}</span>
        </div>
      ))}
      {thinking && (
        <div className="chat-line chat-line-agent">
          <span className="chat-who fixed">{WHO.agent}</span>
          <span className="chat-bubble chat-typing" aria-label="the agent is writing">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      {watched.error !== null && <p className="note note-warn">{watched.error}</p>}
    </div>
  );
}

/** One reply of the agent's: revealed toward its text a frame at a time, a caret while it streams. */
function AgentBubble({ speech, text, instant, done }: { speech: string; text: string; instant: boolean; done: boolean }): ReactNode {
  const shown = useRevealed(speech, text, instant);
  const caught = shown.length >= text.length;
  return (
    <div className="chat-line chat-line-agent">
      <span className="chat-who fixed">{WHO.agent}</span>
      <span className="chat-bubble">
        {shown}
        {!(done && caught) && <span className="chat-caret" aria-hidden />}
      </span>
    </div>
  );
}
