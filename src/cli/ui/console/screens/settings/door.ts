/** The settings doors as the console reads them: the three corners, a set, the history, a rollback, a promote. */

import {
  PromotedSchema,
  TuningAnswerSchema,
  TuningHistorySchema,
  type Promoted,
  type TuningAnswer,
  type TuningBody,
  type TuningHistory,
  type TuningRow,
} from "@pinecall/protocol";

import { post, put, read, type Credentials } from "../../../shared/api";

function door(agent: string): string {
  return `/v1/agents/${encodeURIComponent(agent)}/settings`;
}

/** The three corners as this key sees them, each its own newest. */
export async function readSettings(credentials: Credentials, agent: string): Promise<TuningAnswer> {
  return TuningAnswerSchema.parse(await read(credentials, door(agent)));
}

/** What a set sends: the whole config, the version it was read at, why, and whose corner. */
export interface Set {
  config: TuningBody;
  if_version: number | null;
  note: string | null;
  team: boolean;
}

/** The whole set, as the next version of the corner; the answer is the three corners again. */
export async function setSettings(credentials: Credentials, agent: string, body: Set): Promise<TuningAnswer> {
  return TuningAnswerSchema.parse(await put(credentials, door(agent), body));
}

/** One corner's versions, newest first. */
export async function readHistory(credentials: Credentials, agent: string, team: boolean): Promise<TuningHistory> {
  return TuningHistorySchema.parse(await read(credentials, `${door(agent)}/history`, { team: String(team) }));
}

/** One version back, as the next one. */
export async function rollbackTo(credentials: Credentials, agent: string, version: number, team: boolean): Promise<TuningAnswer> {
  return TuningAnswerSchema.parse(await post(credentials, `${door(agent)}/rollback`, { version, team }));
}

// Only the first hop from here: the second runs the agent's goldens, which live beside the class
// on the developer's disk and travel in the ask — `pinecall agent promote --to production`.
/** Your corner's newest as the team's next version. */
export async function promoteToTeam(credentials: Credentials, agent: string): Promise<Promoted> {
  return PromotedSchema.parse(await post(credentials, `${door(agent)}/promote`, { to: "team", note: null }));
}

/** The fields the page draws, in reading order, under the names it draws them with. */
export const FIELDS = ["voice", "tts", "tts_model", "stt", "llm", "greeting", "hangup", "turn", "memory", "knowledge"] as const;
export type Field = (typeof FIELDS)[number];

export const LABEL: Record<Field, string> = {
  voice: "voice",
  tts: "speaks with",
  tts_model: "tts model",
  stt: "hears with",
  llm: "decides with",
  greeting: "greeting",
  hangup: "hangup",
  turn: "turn",
  memory: "memory",
  knowledge: "knowledge",
};

/** One field of one config as a cell; undefined when the config does not set it. */
export function shown(config: TuningBody, field: Field): string | undefined {
  if (field === "greeting") {
    const greeting = config.greeting ?? undefined;
    if (greeting === undefined) return undefined;
    const say = greeting.say ?? undefined;
    return say !== undefined ? `"${say}"` : `reply: ${greeting.reply ?? ""}`;
  }
  if (field === "hangup") {
    const hangup = config.hangup ?? undefined;
    return hangup === undefined ? undefined : hangup.when ? `when ${hangup.when}` : "may hang up";
  }
  if (field === "turn") {
    const turn = config.turn ?? undefined;
    if (turn === undefined) return undefined;
    const said: string[] = [];
    if (typeof turn.endpointing_ms === "number") said.push(`endpointing ${turn.endpointing_ms} ms`);
    if (typeof turn.min_interruption_words === "number") said.push(`interrupt at ${turn.min_interruption_words} words`);
    return said.join(" · ");
  }
  if (field === "memory") {
    const memory = config.memory ?? undefined;
    return memory === undefined ? undefined : `remember ${memory.remember?.length ?? 0} · forget ${memory.forget?.length ?? 0}`;
  }
  if (field === "knowledge") {
    const bases = config.knowledge ?? undefined;
    return bases === undefined || bases.length === 0 ? undefined : bases.map((one) => `${one.base}${typeof one.k === "number" ? ` (k ${one.k})` : ""}`).join(" · ");
  }
  const value = config[field];
  return typeof value === "string" ? value : undefined;
}

/** The fields two configs set differently, each as `field before → after`. */
export function changes(before: TuningBody, after: TuningBody): string[] {
  const said: string[] = [];
  for (const field of FIELDS) {
    const was = shown(before, field);
    const is = shown(after, field);
    if (was !== is) said.push(`${LABEL[field]} ${was ?? "—"} → ${is ?? "—"}`);
  }
  return said;
}

/** The corner a form edits: yours when the key has one with a row, else the team's. */
export function edited(answer: TuningAnswer, team: boolean): TuningRow | null {
  return team ? answer.team : answer.yours;
}
