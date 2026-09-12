/** The gateway's eval doors, as this CLI knocks at them: run a suite, read a run, read a log. */

import type { Camel, ModelConfig, SessionLine } from "@pinecall/protocol";

import type { Golden } from "./goldens.js";

/** What one judge answered about one golden: the number, the sentence, and what it asked. */
export interface Score {
  metric: string;
  score: number;
  passed: boolean;
  /** The judgment's own reasoning. A hard policy writes the seqs for free; a model is asked. */
  reason: string;
  /** The question that was answered, as livekit hangs it on every judgment it makes. */
  criteria: string;
  /** How many questions this judgment put to a model. Zero for a policy that answers by code. */
  judge_calls: number;
}

/** One request as the provider received it: the system blocks apart, then the messages in order. */
export interface Asked {
  /** One string per static block — identity, knowledge, tools — for the vendor that keeps them
   * apart. Empty for a vendor whose system text travels inside `messages`. */
  system: string[];
  /** Every tool the request carried, as a JSON schema — the list the model actually had. */
  tools: Record<string, unknown>[];
  messages: Record<string, unknown>[];
}

/** One cell of the matrix: a golden under a model, every judge's answer, and the call's summary. */
export interface Cell {
  model: string;
  golden: string;
  scores: Score[];
  summary: Summary | null;
  /** Every request this golden's call made, present only on a cell where something broke: the
   * prompt is not in the log, and a broken golden is the one thing a person has to reproduce.
   * Null when the run kept no requests — a spoken run builds them in the worker process. */
  asked?: Asked[] | null;
}

/** `call.summary` as the log wrote it. Nothing here is recomputed by anybody who reads it. */
export interface Summary {
  duration_s: number;
  turns: number;
  cost?: { eur: number };
}

/** Models down one axis, goldens down the other, one judge's score in every cell. */
export interface Matrix {
  models: string[];
  goldens: string[];
  metrics: string[];
  /** How many questions judging this whole matrix put to a model. Zero is the happy path. */
  judge_calls: number;
  runs: Cell[];
  failures: { model: string; golden: string; metric: string }[];
}

/** One golden under one model, and the call it opened: the log a person opens to disagree. */
export interface Opened {
  golden: string;
  model: string;
  call: string;
}

/** One run of a suite, as the runner stores it and both `test` and `runs` read it back. */
export interface EvalRun {
  id: string;
  agent: string;
  started_at: number;
  finished_at: number | null;
  status: "running" | "done" | "failed";
  calls: Opened[];
  matrix: Matrix | null;
  error: string | null;
}

/** What one POST asks for: the agent, its goldens, the models, and which app socket to use. */
export interface Wanted {
  agent: string;
  goldens: Golden[];
  models?: Camel<ModelConfig>[];
  app?: string;
  /** Ring 2: the same goldens said out loud on a real line, instead of written into a text session. */
  voice?: boolean;
  /** How many dB under the caller's own voice an interferer sits, on a spoken run. */
  interferer_db?: number;
  /** The share of the caller's packets that never arrive, 0 to 1, on a spoken run. */
  packet_loss?: number;
}

/** One entry of a call's log, as `GET /v1/calls/{call}/events` projects it for this reader. */
export interface Entry {
  seq: number;
  type: string;
  data: Record<string, unknown>;
  /** Which call it belongs to. The chat socket's own frames carry it; a page of one call need not. */
  call?: string | null;
}

/** Where this CLI is knocking: the gateway's HTTP address and the key that opens its doors. */
export interface Door {
  url: string;
  apiKey: string;
}

/** Every golden through the app that is holding the agent, scored and stored, in one round trip. */
export async function aRun(door: Door, wanted: Wanted): Promise<EvalRun> {
  return await asked<EvalRun>(door, "/v1/evals/run", { method: "POST", body: wanted });
}

/** The runs this gateway has done, newest first — of one agent, or of the whole fleet. */
export async function theRuns(door: Door, limit: number, agent?: string): Promise<EvalRun[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (agent !== undefined) query.set("agent", agent);
  const answered = await asked<{ runs: EvalRun[] }>(door, `/v1/evals/runs?${query.toString()}`);
  return answered.runs;
}

/** One run, whole: the calls it opened while it happened, and the matrix once it finished. */
export async function oneRun(door: Door, id: string): Promise<EvalRun> {
  return await asked<EvalRun>(door, `/v1/evals/runs/${encodeURIComponent(id)}`);
}

/** Who is on the phone, as the door that plays them needs it: no script, three declarations. */
export interface Persona {
  name: string;
  goal: string;
  style: string;
  facts?: Record<string, unknown>;
}

/** One turn of a simulated call from the caller's side: the business, or the caller themselves. */
export interface Spoken {
  who: "agent" | "caller";
  said: string;
}

/** What the model playing the caller answered: the line, and whether they are done talking. */
export interface Improvised {
  say: string;
  hangup: boolean;
}

/**
 * The next thing the caller says, improvised by a model in the runtime. It runs there because
 * that is the process holding the provider keys — this terminal has the persona and the call so
 * far, and the door has the only thing it is missing. See docs/decisions/simulate.md.
 */
export async function theNextLine(
  door: Door,
  asking: { persona: Persona; heard: Spoken[]; turns_left: number },
): Promise<Improvised> {
  return await asked<Improvised>(door, "/v1/evals/caller", { method: "POST", body: asking });
}

/** What a reader narrows a log to: how many entries, from which seq, and of which types. */
export interface Narrowed {
  limit?: number;
  /** Entries above this seq only. The door calls it `after`, and it is a seq, never an index. */
  after?: number;
  /** `types=a.b,c.d`: the log's own filter, so a reader that wants one entry is served one. */
  types?: string[];
}

/** One page of a call's log as this reader narrowed it: where the seqs a failure names are read. */
export async function entriesOf(door: Door, call: string, narrowed: Narrowed = {}): Promise<Entry[]> {
  const query = new URLSearchParams({
    after: String(narrowed.after ?? 0),
    limit: String(narrowed.limit ?? 500),
  });
  if (narrowed.types !== undefined) query.set("types", narrowed.types.join(","));
  const answered = await asked<{ entries: Entry[] } | null>(
    door,
    `/v1/calls/${encodeURIComponent(call)}/events?${query.toString()}`,
  );
  // 204 is the door saying the call is over and this cursor has all of it: an empty body, and an
  // empty page is the honest reading of it. Every other refusal still travels as an error.
  return answered?.entries ?? [];
}

/** Which calls this agent handled, newest first: the list drift reads its two windows out of. */
export async function theSessions(door: Door, agent: string, limit: number): Promise<SessionLine[]> {
  const path = `/v1/agents/${encodeURIComponent(agent)}/sessions?limit=${limit}`;
  const answered = await asked<{ calls: SessionLine[] }>(door, path);
  return answered.calls;
}

/** What the gateway answered when it did not answer 2xx: the status, and its own sentence. */
/** What a gateway says about itself with no key: which runtime, and whether it opens a sign-up. */
export interface Discovered {
  version: string;
  cloud: boolean;
  signup: boolean;
  /** How short a password this gateway accepts; 0 is no rule. A card asking for one says it. */
  min_password: number;
}

/**
 * `GET /.well-known/pinecall`, the one door that takes no key and asks nothing of the caller.
 *
 * A gateway too old to answer it, or one that does not answer at all, reads as a gateway that
 * opens no sign-up: guessing that way offers nothing, and the other way would walk a person
 * through typing a password for a door that refuses.
 */
export async function discovered(url: string): Promise<Discovered> {
  const shut: Discovered = { version: "", cloud: false, signup: false, min_password: 0 };
  try {
    const answer = await fetch(`${url.replace(/\/$/, "")}/.well-known/pinecall`);
    if (!answer.ok) return shut;
    const said = (await answer.json()) as Partial<Discovered>;
    return {
      version: said.version ?? "",
      cloud: said.cloud === true,
      signup: said.signup === true,
      min_password: said.min_password ?? 0,
    };
  } catch {
    return shut;
  }
}

export class Refused extends Error {
  constructor(
    readonly status: number,
    readonly text: string,
  ) {
    super(`the gateway answered ${status}: ${text}`);
  }
}

// One door, one fetch, one refusal: every verb that knocks here spells neither the header, the
// JSON nor the error sentence again. What the gateway refused travels as its own words, because
// "the agent is not registered" and "no ring installed" both arrive this way and both name the fix.
export async function asked<T>(
  door: Door,
  path: string,
  sent: { method?: string; body?: unknown } = {},
): Promise<T> {
  // A door that mints the first key takes none (`/v1/signup`), so an empty key sends no header
  // rather than an empty Bearer: what is not held is not claimed.
  const authorization = door.apiKey === "" ? {} : { authorization: `Bearer ${door.apiKey}` };
  const answered = await fetch(`${door.url.replace(/\/$/, "")}${path}`, {
    method: sent.method ?? "GET",
    headers: { ...authorization, "content-type": "application/json" },
    ...(sent.body === undefined ? {} : { body: JSON.stringify(sent.body) }),
  });
  const text = await answered.text();
  if (!answered.ok) throw new Refused(answered.status, text);
  return (text === "" ? null : JSON.parse(text)) as T;
}
