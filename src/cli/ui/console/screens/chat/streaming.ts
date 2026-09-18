/** The agent's reply as it streams: the deltas of the log added up, and revealed a frame at a time. */

import type { Entry } from "@pinecall/protocol";
import { useEffect, useRef, useState } from "react";

/**
 * What the agent has said so far in each reply, by speech id, off the log's entries in order.
 *
 * A written call logs every model delta as its own `agent.transcript` — a piece of a word, not the
 * text so far. The protocol's reducer joins them into `state.live.agent`, but only for the reply
 * in flight: a bubble needs every reply of the call, settled or not, by speech id, so the chat
 * adds them up itself. A reply that reached `turn.agent` is settled; the turn's own text wins
 * from then on.
 */
export function repliesOf(entries: Entry[]): { streaming: Map<string, string>; settled: Set<string> } {
  const streaming = new Map<string, string>();
  const settled = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "agent.transcript") {
      const data = entry.data as { speech_id: string; text: string; final: boolean };
      if (data.final) continue;
      streaming.set(data.speech_id, (streaming.get(data.speech_id) ?? "") + data.text);
    } else if (entry.type === "turn.agent") {
      settled.add((entry.data as { speech_id: string }).speech_id);
    }
  }
  return { streaming, settled };
}

// How far each reply has been revealed, across mounts: the streaming bubble at the foot and the
// settled turn in the list are two elements for one reply, and the second must carry on from the
// character the first reached instead of drawing the whole text again.
const revealed = new Map<string, number>();

// Characters a frame at the least, and the share of what is still hidden a frame adds on top:
// a reply that arrives in a burst catches up in a few hundred milliseconds, a slow one reads at
// the speed it arrives, and nothing ever lags behind the model by more than a breath.
const MIN_PER_FRAME = 1;
const SHARE_PER_FRAME = 0.18;

/**
 * The text to draw for one reply this frame: grows toward `target` on requestAnimationFrame and
 * never shrinks. `instant` draws the whole text at once — a call opened after the fact, whose
 * replies were written long ago, has nothing to animate.
 */
export function useRevealed(key: string, target: string, instant: boolean): string {
  const [shown, setShown] = useState(() => (instant ? target.length : (revealed.get(key) ?? 0)));
  const aim = useRef(target.length);
  aim.current = target.length;

  useEffect(() => {
    if (instant) {
      revealed.set(key, target.length);
      setShown(target.length);
      return;
    }
    let frame = 0;
    const step = (): void => {
      setShown((now) => {
        const left = aim.current - now;
        if (left <= 0) return now;
        const next = Math.min(aim.current, now + Math.max(MIN_PER_FRAME, Math.ceil(left * SHARE_PER_FRAME)));
        revealed.set(key, next);
        return next;
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, instant, target.length]);

  return target.slice(0, Math.min(shown, target.length));
}
