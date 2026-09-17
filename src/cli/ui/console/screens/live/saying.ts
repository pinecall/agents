/** The words the agent is saying right now, folded from the deltas the log carries them as. */

import type { Entry } from "@pinecall/protocol";

/**
 * `agent.transcript` is a DELTA — one word of a spoken reply with the seconds the voice measured
 * for it, one token of a written one — so the reply in flight is every delta since the last turn
 * the agent finished, of the one speech still running. Null when the agent is saying nothing.
 */
export function agentSaying(entries: readonly Entry[]): string | null {
  const pieces: { text: string; timed: boolean }[] = [];
  let speech: string | null = null;
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    const entry = entries[at];
    if (entry === undefined || entry.type === "turn.agent") break;
    if (entry.type !== "agent.transcript") continue;
    const data = entry.data as { speech_id?: string | null; text?: string; final?: boolean; start?: number };
    if (data.final === true) break;
    const spoken = data.speech_id ?? "";
    if (speech === null) speech = spoken;
    if (spoken !== speech) break;
    pieces.unshift({ text: data.text ?? "", timed: data.start !== undefined });
  }
  if (pieces.length === 0) return null;

  // A timed word may arrive bare; a token of a written reply carries its own spacing, and gluing a
  // space between "clean" and "ing" would be a word nobody said.
  let said = "";
  for (const piece of pieces) {
    const apart = said === "" || /\s$/.test(said) || /^\s/.test(piece.text);
    said += piece.timed && !apart ? ` ${piece.text}` : piece.text;
  }
  return said.trim() === "" ? null : said;
}
