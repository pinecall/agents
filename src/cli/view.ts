/** The live terminal view as a pure function: entries in, one screen of text out. No terminal here. */

import type { CamelEvent } from "../client/index.js";

/** One line of the view, already formatted, with the mark that says what kind of line it is. */
export interface Line {
  mark: string;
  text: string;
}

/** Everything the view knows, folded from the entries it has seen. Nothing here is the screen. */
export interface Screen {
  slug: string;
  url: string;
  calls: number;
  transcript: Line[];
  tools: Line[];
  state: Record<string, unknown>;
  /** The fields the last state.changed named: what the STATE panel highlights. */
  changed: string[];
  metrics: string[];
  events: string[];
}

// The mark column is a glyph and never a colour: this view is read over ssh, piped to grep and
// pasted into a card, and none of those carry an escape sequence.
export const CALLER = "‹";
const AGENT = "›";
const ASKS = "→";
const ANSWERS = "←";
// The mark an error wears in the middle of a transcript. Not one of the conversation's four —
// the live view draws an error in a panel of its own — but `pinecall chat` and the talk page both
// put one between two turns, and one glyph is spelled once.
export const BROKE = "✗";

// A panel that grows forever is a panel nobody can read: the view keeps what fits on a screen
// and forgets the rest. The log keeps everything; this is a window onto it, not a copy of it.
const KEPT = 200;

/** A view that has seen nothing yet. */
export function screenFor(slug: string, url: string): Screen {
  return { slug, url, calls: 0, transcript: [], tools: [], state: {}, changed: [], metrics: [], events: [] };
}

/**
 * One event folded into the view. Pure: it returns the next screen and touches nothing else,
 * which is what lets the whole live view be tested without a terminal or a gateway.
 */
export function absorb(screen: Screen, event: CamelEvent): Screen {
  const next: Screen = { ...screen, events: keep([...screen.events, JSON.stringify(event)]) };
  switch (event.type) {
    case "call.started":
      return { ...next, calls: screen.calls + 1 };
    case "turn.user":
      return { ...next, transcript: keep([...screen.transcript, lineFor(event)!]) };
    case "turn.agent":
      return {
        ...next,
        transcript: keep([...screen.transcript, lineFor(event)!]),
        metrics: keep([...screen.metrics, metricsLine(event.data.metrics)]),
      };
    case "tool.call":
    case "tool.result":
      return { ...next, tools: keep([...screen.tools, lineFor(event)!]) };
    case "state.changed":
      return { ...next, state: { ...event.data.state }, changed: [...event.data.changed] };
    default:
      return next;
  }
}

/**
 * The one line an event is worth, mark and all, or null when it is not a line at all. The view
 * draws these into its panels and `pinecall chat` prints them one per frame: one renderer, so the
 * marks mean the same thing in both places.
 */
export function lineFor(event: CamelEvent): Line | null {
  switch (event.type) {
    case "turn.user":
      return { mark: CALLER, text: String(event.data.text ?? "") };
    case "turn.agent":
      return { mark: AGENT, text: String(event.data.text ?? "") };
    case "tool.call":
      return { mark: ASKS, text: toolCallLine(event.data) };
    case "tool.result":
      return { mark: ANSWERS, text: toolResultLine(event.data) };
    default:
      return null;
  }
}

// Only the fields livekit actually measured for this turn, in the order a person reads them:
// how long the caller waited, then where that time went. A metric the session did not take is
// left out rather than printed as a zero, because a zero here would read as "instant".
export const TURN_METRICS = ["e2e_latency", "llm_node_ttft", "tts_node_ttfb"] as const;

/** The one line a finished agent turn is worth: its latencies, in milliseconds, or a dash. */
export function metricsLine(metrics: Record<string, unknown> | undefined): string {
  const parts: string[] = [];
  for (const name of TURN_METRICS) {
    const value = metrics?.[name];
    if (typeof value === "number") parts.push(`${name} ${Math.round(value * 1000)}ms`);
  }
  return parts.length === 0 ? "no metrics on this turn" : parts.join("  ");
}

/** The STATE panel: one field per line, the ones the last change named marked with a dot. */
export function statePanel(state: Record<string, unknown>, changed: string[]): string[] {
  const names = Object.keys(state);
  if (names.length === 0) return ["  (no state yet)"];
  return names.map((name) => `${changed.includes(name) ? "● " : "  "}${name}: ${short(state[name])}`);
}

/** The whole view as one screen of text, cut to the terminal it is going to be written on. */
export function draw(screen: Screen, rows: number, columns: number, raw = false): string {
  const body = raw ? screen.events.slice(-(rows - 4)) : panels(screen, rows);
  const lines = [
    `pinecall ${screen.slug}  ${screen.url}  calls ${screen.calls}`,
    divider(columns),
    ...body,
  ];
  return lines.map((line) => line.slice(0, columns)).join("\n");
}

// The three panels under the header, in the order a person's eye goes: what was said, what ran,
// and what the agent believes right now. The transcript gets whatever height is left over.
function panels(screen: Screen, rows: number): string[] {
  const state = statePanel(screen.state, screen.changed);
  const tools = screen.tools.slice(-5);
  const metric = screen.metrics.at(-1);
  const height = Math.max(3, rows - state.length - tools.length - 9);
  return [
    ...screen.transcript.slice(-height).map((line) => `${line.mark} ${line.text}`),
    "",
    "TOOLS",
    ...tools.map((line) => `${line.mark} ${line.text}`),
    "",
    "STATE",
    ...state,
    "",
    `metrics  ${metric ?? "—"}`,
  ];
}

function divider(columns: number): string {
  return "─".repeat(Math.max(1, Math.min(columns, 100)));
}

function toolCallLine(data: { name: string; arguments: Record<string, unknown> }): string {
  return `${data.name}(${short(data.arguments)})`;
}

function toolResultLine(data: {
  name?: string | undefined;
  output?: unknown;
  error?: unknown;
  summary?: string | null | undefined;
}): string {
  if (data.error !== undefined && data.error !== null) return `${data.name ?? "tool"} error: ${short(data.error)}`;
  // A method that returns nothing answers with no output at all — JSON has no undefined — and
  // the line says so in a word, never as the JavaScript for it.
  const answered = data.summary ?? (data.output === undefined ? "nothing" : short(data.output));
  return `${data.name ?? "tool"} ${answered}`;
}

// A value is shown as the JSON it is, cut: the view is a window onto the state, and a caller's
// whole slot list would push the panel it belongs to off the screen.
function short(value: unknown, width = 60): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  return text.length > width ? `${text.slice(0, width - 1)}…` : text;
}

function keep<T>(lines: T[]): T[] {
  return lines.length > KEPT ? lines.slice(-KEPT) : lines;
}
