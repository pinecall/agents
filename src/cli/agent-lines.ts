/** How `pinecall agent` says the three corners on one page, and the door it reads them from. */

import type { TuningAnswer, TuningBody, TuningRow } from "@pinecall/protocol";

import { dayAndTime } from "./docs.js";
import { asked, type Door } from "./testing/gateway.js";

/** The settings door of one agent, spelled once for every verb that knocks at it. */
export function settingsPath(agent: string): string {
  return `/v1/agents/${encodeURIComponent(agent)}/settings`;
}

/** The three corners as this key sees them: its own, the team's, production's. */
export async function readSettings(door: Door, agent: string): Promise<TuningAnswer> {
  return await asked<TuningAnswer>(door, settingsPath(agent));
}

/** The fields on the page, in the order a person reads them, under the names a person types. */
export const FIELDS = ["voice", "tts", "tts-model", "stt", "llm", "greeting", "hangup", "turn", "memory", "knowledge", "bases"] as const;
export type Field = (typeof FIELDS)[number];

/** The name a person types, as the wire spells it. */
export const WIRE: Record<Field, keyof TuningBody> = {
  voice: "voice",
  tts: "tts",
  "tts-model": "tts_model",
  stt: "stt",
  llm: "llm",
  greeting: "greeting",
  hangup: "hangup",
  turn: "turn",
  memory: "memory",
  knowledge: "knowledge",
  bases: "bases",
};

// A cell is one line, however the field is shaped: the words of an opening in quotes, a turn's
// two numbers, a memory policy as two counts, the bases by name. Long words are cut, because a
// page of three columns has to stay a page.
const A_CELL = 40;

/** One field of one config, as a cell of the page; undefined when the config does not set it. */
export function shown(config: TuningBody, field: Field): string | undefined {
  // The wire leaves a field out or sends null for "not set": both read as nothing here.
  if (field === "greeting") {
    const greeting = config.greeting ?? undefined;
    if (greeting === undefined) return undefined;
    const say = greeting.say ?? undefined;
    return say !== undefined ? `"${say}"` : `reply: ${greeting.reply ?? ""}`;
  }
  if (field === "hangup") {
    const hangup = config.hangup ?? undefined;
    if (hangup === undefined) return undefined;
    return hangup.when === "" || hangup.when === null || hangup.when === undefined ? "may hang up" : `when ${hangup.when}`;
  }
  if (field === "turn") {
    const turn = config.turn ?? undefined;
    if (turn === undefined) return undefined;
    const said: string[] = [];
    if (turn.endpointing_ms !== undefined && turn.endpointing_ms !== null) said.push(`endpointing ${turn.endpointing_ms} ms`);
    if (turn.min_interruption_words !== undefined && turn.min_interruption_words !== null) said.push(`interrupt at ${turn.min_interruption_words} words`);
    return said.join(" · ");
  }
  if (field === "memory") {
    const memory = config.memory ?? undefined;
    if (memory === undefined) return undefined;
    return `remember ${memory.remember?.length ?? 0} · forget ${memory.forget?.length ?? 0}`;
  }
  if (field === "knowledge") {
    const text = config.knowledge ?? undefined;
    return text === undefined ? undefined : `${text.length.toLocaleString("en-US")} chars`;
  }
  if (field === "bases") {
    const bases = config.bases ?? undefined;
    if (bases === undefined || bases.length === 0) return undefined;
    return bases.map((one) => `${one.base}${one.k === undefined || one.k === null ? "" : ` (k ${one.k})`}`).join(" · ");
  }
  const value = config[WIRE[field]];
  return typeof value === "string" ? value : undefined;
}

/** One kept version on one line: the number, who, when, and why. */
export function versionLine(row: TuningRow): string {
  const said = [`v${row.version}`, row.author, dayAndTime(row.set_at)];
  if (row.note !== null) said.push(`"${row.note}"`);
  return said.join(" · ");
}

/**
 * The page: the agent and the world, the three corners as columns, a row per field, and under
 * them which version each corner is at. A corner that set nothing reads as what it falls back
 * to — `(team's)` in your column — because that is what a session built there runs.
 */
export function linesOf(agent: string, answer: TuningAnswer): string[] {
  const corners: { name: string; row: TuningRow | null; fallsTo: string }[] = [
    { name: "yours", row: answer.yours, fallsTo: "(team's)" },
    { name: "team", row: answer.team, fallsTo: "—" },
    { name: "production", row: answer.production, fallsTo: "—" },
  ];
  const cell = (corner: (typeof corners)[number], field: Field): string => {
    if (corner.row === null) return corner.fallsTo;
    const value = shown(corner.row.config, field);
    if (value === undefined) return "—";
    return value.length > A_CELL ? `${value.slice(0, A_CELL - 1)}…` : value;
  };
  const widths = corners.map((corner) => Math.max(corner.name.length, ...FIELDS.map((field) => cell(corner, field).length)) + 2);
  const lines = [`${agent} · ${answer.world}`, ""];
  lines.push(`  ${"".padEnd(14)}${corners.map((corner, at) => corner.name.padEnd(widths[at]!)).join("")}`.trimEnd());
  for (const field of FIELDS) {
    lines.push(`  ${field.replace("-", " ").padEnd(14)}${corners.map((corner, at) => cell(corner, field).padEnd(widths[at]!)).join("")}`.trimEnd());
  }
  lines.push("");
  lines.push(`  ${corners.map((corner) => `${corner.name}: ${corner.row === null ? "nothing set" : versionLine(corner.row)}`).join(" · ")}`);
  return lines;
}
