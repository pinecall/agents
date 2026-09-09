/** What the Talk screen draws: the two voices as the room says them, and the log's marks between them. */

import type { Entry } from "@pinecall/protocol";

import { supervisorMark } from "../../lib/supervisor-mark";

/** Who a line belongs to. The agent is a participant of kind AGENT; everyone else is the caller. */
export type Speaker = "user" | "agent";

/** One segment of speech: grey while `final` is false, solid once the trailer settles it. */
export interface Said {
  kind: "said";
  id: string;
  speaker: Speaker;
  text: string;
  final: boolean;
}

/** One thing the log said between two sentences: a tool, an error, or a supervisor stepping in. */
export interface Mark {
  kind: "mark";
  id: string;
  tone: "tool" | "error" | "supervisor";
  text: string;
}

export type Line = Said | Mark;

// Both sides of the conversation arrive from the room on this topic, as livekit-agents publishes
// them: the caller's transcript as one whole stream per STT update, the agent's as one stream per
// sentence written in deltas at the pace the voice is synthesised. That pace is the karaoke.
export const TRANSCRIPTION_TOPIC = "lk.transcription";
export const SEGMENT_ID = "lk.segment_id";
export const TRANSCRIPTION_FINAL = "lk.transcription_final";

// A tool the model calls is logged the instant it asks for it; the sentence that announces it
// reaches the page only as the voice says it, a beat later. A mark that arrives before the agent
// has spoken waits this long for the agent's next sentence, and is placed under it.
export const A_BEAT_MS = 1500;

// The marks are the terminal view's (src/cli/view.ts), so the page and
// `pinecall chat` draw one conversation the same way.
const ASKS = "→";
const ANSWERS = "←";
const BROKE = "✗";

/** Add or replace one line by id, keeping first-arrival order — a transcript is never reordered. */
export function upsert(lines: Line[], line: Line): Line[] {
  const at = lines.findIndex((row) => row.id === line.id);
  if (at === -1) return [...lines, line];
  const next = lines.slice();
  next[at] = line;
  return next;
}

/** The words of a line, keeping the spaces, so the renderer can animate each arrival once. */
export function words(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/** The mark one entry of the log is worth on this screen, or null when it is worth none. */
export function markOf(entry: Entry): Mark | null {
  // A supervisor can whisper into this call too, and it reads here the way it reads on the Calls
  // screen: one sentence, written once, in lib/supervisor-mark.ts.
  const supervised = supervisorMark(entry);
  if (supervised !== null) {
    return { kind: "mark", id: `mark-${entry.seq}`, tone: "supervisor", text: supervised.said };
  }
  const data = entry.data as Record<string, unknown>;
  switch (entry.type) {
    case "tool.call":
      return { kind: "mark", id: `mark-${entry.seq}`, tone: "tool", text: `${ASKS} ${String(data["name"])}(${short(data["arguments"])})` };
    case "tool.result":
      return { kind: "mark", id: `mark-${entry.seq}`, tone: "tool", text: `${ANSWERS} ${String(data["name"])} ${answered(data)}` };
    case "error":
      return { kind: "mark", id: `mark-${entry.seq}`, tone: "error", text: `${BROKE} ${String(data["message"])}` };
    default:
      return null;
  }
}

function answered(data: Record<string, unknown>): string {
  if (data["error"] !== undefined && data["error"] !== null) return `error: ${short(data["error"])}`;
  if (typeof data["summary"] === "string") return data["summary"];
  return data["output"] === undefined ? "nothing" : short(data["output"]);
}

function short(value: unknown, width = 80): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}
