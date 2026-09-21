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

// Which corner a write lands on — of the settings, of the lexicon, of anything kept in three.
// The gateway writes the org's own corner when the request asks for it (`--team`) OR when the key
// holds no corner of its own: a production token, a person acting in production, a CI key. A write
// that read `yours` in that case would send the WHOLE set built on an EMPTY row and take the
// corner's other fields out — in production `agent set --voice` erased the knowledge and the base,
// silently (2026-09-19, the simulated team on the box). The read has to name the same corner the
// door will write, and `pull` already did: this is that line, once, for every verb that writes.
/** The row a write lands on: the team's when asked for it or when this key has no corner. */
export function theCornerWritten<Row>(standing: { yours: Row | null; team: Row | null }, team: boolean): Row | null {
  return team ? standing.team : (standing.yours ?? standing.team);
}

/** What a write leaves the corner saying: the set as it stands, and what it should say next. */
export type Change = (config: TuningBody) => TuningBody;

/** A corner read once: its row as it stands, and the one way to write the next version of it. */
export interface TheCorner {
  /** The row the gateway will write over, or null when this corner has never been written. */
  row: TuningRow | null;
  /** The whole set, with this change made, as the next version. */
  write(change: Change, note: string | null): Promise<TuningAnswer>;
}

/**
 * Every verb that sets one field of an agent's settings writes through here, and that is the
 * point: the door takes the WHOLE set with the version it was read at, so a body built on the
 * wrong row erases every field it does not carry, silently, in one version.
 *
 * It went wrong twice, in two verbs, the same way: `agent set --voice` took the knowledge and the
 * base out of a production corner (2026-09-19), and one `memory policy` took the voice, the stt,
 * the llm, the greeting, the hangup and the attached base out of another (2026-09-20). Both read
 * `yours`, and both were run by a key that holds no corner of its own — a server's token, a CI
 * key, a person acting in production — where the gateway writes the ORG's corner and `yours` is
 * null. There were five hand-written copies of this write; now there is one, and the corner and
 * the version cannot be got wrong by a verb that only knows what it wants to change.
 */
export async function theCornerToWrite(door: Door, agent: string, team: boolean): Promise<TheCorner> {
  const standing = await readSettings(door, agent);
  const row = theCornerWritten(standing, team);
  return {
    row,
    write: async (change: Change, note: string | null) =>
      await asked<TuningAnswer>(door, settingsPath(agent), {
        method: "PUT",
        body: { config: change(row?.config ?? {}), if_version: row?.version ?? null, note, team },
      }),
  };
}

/** The corner this key READS: its own where it has one, the team's where it has not. Written the
 * same way a write picks its corner, because they are the same question asked without `--team`. */
export function theCornerRead<Row>(standing: { yours: Row | null; team: Row | null }): Row | null {
  return theCornerWritten(standing, false);
}

/** What to call the corner a write lands on, so the line a person reads is the corner written. */
export function theCornerCalled(standing: TuningAnswer, team: boolean): string {
  if (standing.world === "production") return "production";
  return team || standing.yours === null ? "the team's corner" : "your corner";
}

/** The fields on the page, in the order a person reads them, under the names a person types. */
export const FIELDS = ["voice", "tts", "tts-model", "stt", "llm", "greeting", "hangup", "turn", "memory", "record", "knowledge", "bases"] as const;
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
  record: "record",
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
    if (turn.eot_threshold !== undefined && turn.eot_threshold !== null) said.push(`sure at ${turn.eot_threshold}`);
    if (turn.eager_eot_threshold !== undefined && turn.eager_eot_threshold !== null) said.push(`guesses at ${turn.eager_eot_threshold}`);
    return said.join(" · ");
  }
  if (field === "memory") {
    const memory = config.memory ?? undefined;
    if (memory === undefined) return undefined;
    return `remember ${memory.remember?.length ?? 0} · forget ${memory.forget?.length ?? 0}`;
  }
  // The one field whose FALSE is the thing worth reading: a corner that says nothing falls
  // through to the one below, and a corner that says no keeps no audio at all.
  if (field === "record") {
    const records = config.record ?? undefined;
    return records === undefined ? undefined : records ? "keeps the audio" : "keeps no audio";
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
